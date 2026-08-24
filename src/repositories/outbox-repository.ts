import { QueryTypes } from 'sequelize';
import type { Transaction } from 'sequelize';
import { sequelize } from '../db/mysql';

export interface NewOutboxEvent {
  eventId: string;
  eventType: string;
  messageId: number;
  conversationId: number;
}

export interface ClaimedOutboxEvent {
  id: number;
  eventId: string;
  messageId: number;
  conversationId: number;
  attempts: number;
}

export interface OutboxClaimOptions {
  batchSize: number;
  backoffBaseSeconds: number;
  backoffCapSeconds: number;
  maxAttempts: number;
}

export interface OutboxCleanupOptions {
  retentionHours: number;
  requireMirrored: boolean;
  limit: number;
}

export interface OutboxRepository {
  insertPending(event: NewOutboxEvent, transaction: Transaction): Promise<void>;
  markPublishedByEventId(eventId: string): Promise<boolean>;
  markFailedExhausted(maxAttempts: number): Promise<number>;
  claimBatch(options: OutboxClaimOptions): Promise<ClaimedOutboxEvent[]>;
  markPublishedByIds(ids: readonly number[]): Promise<void>;
  deletePublishedBatch(options: OutboxCleanupOptions): Promise<number>;
  countPending(): Promise<number>;
}

function toAffectedRows(queryResult: [unknown, unknown]): number {
  const [results, metadata] = queryResult;
  const source = (metadata ?? results) as { affectedRows?: number } | null;
  return source?.affectedRows ?? 0;
}

class SequelizeOutboxRepository implements OutboxRepository {
  async insertPending(event: NewOutboxEvent, transaction: Transaction): Promise<void> {
    await sequelize.query(
      `INSERT INTO message_outbox (event_id, event_type, message_id, conversation_id)
      VALUES (:eventId, :eventType, :messageId, :conversationId)`,
      { replacements: { ...event }, transaction }
    );
  }

  async markPublishedByEventId(eventId: string): Promise<boolean> {
    const affected = toAffectedRows(
      await sequelize.query(
        `UPDATE message_outbox
        SET status = 'published', published_at = NOW(3)
        WHERE event_id = :eventId AND status = 'pending'`,
        { replacements: { eventId } }
      )
    );

    return !!affected;
  }

  async markFailedExhausted(maxAttempts: number): Promise<number> {
    return toAffectedRows(
      await sequelize.query(
        `UPDATE message_outbox
        SET status = 'failed'
        WHERE status = 'pending' AND attempts >= :maxAttempts AND available_at <= NOW(3)`,
        { replacements: { maxAttempts } }
      )
    );
  }

  async claimBatch(options: OutboxClaimOptions): Promise<ClaimedOutboxEvent[]> {
    const transaction = await sequelize.transaction();

    try {
      const rows = await sequelize.query<ClaimedOutboxEvent>(
        `SELECT id, event_id AS eventId, message_id AS messageId,
          conversation_id AS conversationId, attempts
        FROM message_outbox
        WHERE status = 'pending' AND available_at <= NOW(3) AND attempts < :maxAttempts
        ORDER BY id
        LIMIT :batchSize
        FOR UPDATE SKIP LOCKED`,
        {
          replacements: { maxAttempts: options.maxAttempts, batchSize: options.batchSize },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      if (rows.length) {
        await sequelize.query(
          `UPDATE message_outbox
          SET available_at = DATE_ADD(NOW(3),
                INTERVAL LEAST(:capSeconds, :baseSeconds * POW(2, attempts)) SECOND),
              attempts = attempts + 1
          WHERE id IN (:ids)`,
          {
            replacements: {
              capSeconds: options.backoffCapSeconds,
              baseSeconds: options.backoffBaseSeconds,
              ids: rows.map(row => row.id)
            },
            transaction
          }
        );
      }

      await transaction.commit();
      return rows;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async markPublishedByIds(ids: readonly number[]): Promise<void> {
    if (!ids.length) return;

    await sequelize.query(
      `UPDATE message_outbox
      SET status = 'published', published_at = NOW(3)
      WHERE id IN (:ids) AND status = 'pending'`,
      { replacements: { ids: [...ids] } }
    );
  }

  async deletePublishedBatch(options: OutboxCleanupOptions): Promise<number> {
    return toAffectedRows(
      await sequelize.query(
        `DELETE FROM message_outbox
        WHERE status = 'published'
          AND published_at < DATE_SUB(NOW(3), INTERVAL :retentionHours HOUR)
          AND (:requireMirrored = 0 OR mirrored_at IS NOT NULL)
        LIMIT :limitRows`,
        {
          replacements: {
            retentionHours: options.retentionHours,
            requireMirrored: options.requireMirrored ? 1 : 0,
            limitRows: options.limit
          }
        }
      )
    );
  }

  async countPending(): Promise<number> {
    const rows = await sequelize.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM message_outbox WHERE status = 'pending'`,
      { type: QueryTypes.SELECT }
    );

    return rows[0]?.count ?? 0;
  }
}

export const outboxRepository: OutboxRepository = new SequelizeOutboxRepository();
