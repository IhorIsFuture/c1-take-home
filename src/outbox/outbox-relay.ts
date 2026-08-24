import { conversationRepository } from '../repositories/conversation-repository';
import { messageMetadataRepository } from '../repositories/message-metadata-repository';
import { outboxRepository } from '../repositories/outbox-repository';
import type { RealtimePublisher } from '../realtime/index';

const cleanupBatchSize = 1000;

export interface OutboxRelayOptions {
  batchSize: number;
  pollIntervalMs: number;
  backoffBaseSeconds: number;
  backoffCapSeconds: number;
  maxAttempts: number;
  retentionHours: number;
  cleanupIntervalMs: number;
  requireMirroredForCleanup: boolean;
  onError?: (error: unknown) => void;
}

export interface OutboxRelayCycleResult {
  claimed: number;
  published: number;
}

type ReadinessAwarePublisher = RealtimePublisher & {
  isReady?: () => Promise<boolean>;
};

export class OutboxRelay {
  private readonly publisher: ReadinessAwarePublisher;
  private readonly options: OutboxRelayOptions;
  private readonly reportError: (error: unknown) => void;
  private relayTimer?: ReturnType<typeof setTimeout>;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  private relayInFlight: Promise<unknown> = Promise.resolve();
  private cleanupInFlight: Promise<unknown> = Promise.resolve();
  private stopped = false;

  constructor(publisher: ReadinessAwarePublisher, options: OutboxRelayOptions) {
    this.publisher = publisher;
    this.options = options;
    this.reportError = options.onError ?? (error => console.error('Outbox relay error', error));
  }

  start(): void {
    this.stopped = false;
    this.scheduleRelay(this.options.pollIntervalMs);
    this.scheduleCleanup(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.relayTimer) clearTimeout(this.relayTimer);
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    await Promise.allSettled([this.relayInFlight, this.cleanupInFlight]);
  }

  async runRelayCycleOnce(): Promise<OutboxRelayCycleResult> {
    if (this.publisher.isReady && !(await this.publisher.isReady())) {
      return { claimed: 0, published: 0 };
    }

    await outboxRepository.markFailedExhausted(this.options.maxAttempts);

    const claimed = await outboxRepository.claimBatch({
      batchSize: this.options.batchSize,
      backoffBaseSeconds: this.options.backoffBaseSeconds,
      backoffCapSeconds: this.options.backoffCapSeconds,
      maxAttempts: this.options.maxAttempts
    });

    if (!claimed.length) return { claimed: 0, published: 0 };

    const records = await messageMetadataRepository.findByIds(
      claimed.map(event => event.messageId)
    );
    const recordById = new Map(records.map(record => [record.id, record]));
    const participantsByConversationId =
      await conversationRepository.listParticipantIdsByConversationIds([
        ...new Set(claimed.map(event => event.conversationId))
      ]);
    const publishedIds: number[] = [];

    for (const event of claimed) {
      const record = recordById.get(event.messageId);

      if (!record || record.body === null) {
        this.reportError(
          new Error(`Outbox event ${event.eventId} references a message without a stored body`)
        );
        continue;
      }

      const recipientUserIds = participantsByConversationId.get(event.conversationId) ?? [];

      if (!recipientUserIds.length) {
        publishedIds.push(event.id);
        continue;
      }

      try {
        await this.publisher.publish(
          {
            type: 'message.created',
            message: {
              id: record.id,
              conversationId: record.conversationId,
              senderId: record.senderId,
              senderName: record.senderName,
              body: record.body,
              createdAt: record.createdAt
            }
          },
          recipientUserIds
        );
        publishedIds.push(event.id);
      } catch (error) {
        this.reportError(error);
      }
    }

    await outboxRepository.markPublishedByIds(publishedIds);

    return { claimed: claimed.length, published: publishedIds.length };
  }

  async runCleanupOnce(): Promise<number> {
    let deleted = 0;

    while (true) {
      const affected = await outboxRepository.deletePublishedBatch({
        retentionHours: this.options.retentionHours,
        requireMirrored: this.options.requireMirroredForCleanup,
        limit: cleanupBatchSize
      });

      deleted += affected;
      if (affected < cleanupBatchSize) break;
    }

    return deleted;
  }

  private scheduleRelay(delayMs: number): void {
    if (this.stopped) return;

    this.relayTimer = setTimeout(() => {
      this.relayInFlight = this.runRelayCycleOnce()
        .catch(this.reportError)
        .finally(() => this.scheduleRelay(this.options.pollIntervalMs));
    }, delayMs);
    this.relayTimer.unref();
  }

  private scheduleCleanup(delayMs: number): void {
    if (this.stopped) return;

    this.cleanupTimer = setTimeout(() => {
      this.cleanupInFlight = this.runCleanupOnce()
        .catch(this.reportError)
        .finally(() => this.scheduleCleanup(this.options.cleanupIntervalMs));
    }, delayMs);
    this.cleanupTimer.unref();
  }
}
