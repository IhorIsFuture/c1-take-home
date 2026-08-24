import type { MysqlMigration } from '../migrator';

const readStateInitModes = ['history-read', 'all-unread'] as const;

type ReadStateInitMode = (typeof readStateInitModes)[number];

function resolveReadStateInitMode(): ReadStateInitMode {
  const mode = process.env.READ_STATE_INIT ?? 'history-read';

  if (!readStateInitModes.includes(mode as ReadStateInitMode)) {
    throw new Error(`READ_STATE_INIT must be one of: ${readStateInitModes.join(', ')}`);
  }

  return mode as ReadStateInitMode;
}

export const up: MysqlMigration = async ({ context }) => {
  const mode = resolveReadStateInitMode();

  await context.sequelize.query(`INSERT INTO conversation_summaries
      (conversation_id, last_message_id, last_message_at, last_sender_id, last_message_preview)
    SELECT c.id, m.id, m.created_at, m.sender_id, NULL
    FROM conversations c
    LEFT JOIN conversation_summaries s ON s.conversation_id = c.id
    LEFT JOIN messages m ON m.id =
      (SELECT MAX(m2.id) FROM messages m2 WHERE m2.conversation_id = c.id)
    WHERE s.conversation_id IS NULL`);

  if (mode === 'history-read') {
    await context.sequelize.query(`UPDATE conversation_participants p
      JOIN conversation_summaries s ON s.conversation_id = p.conversation_id
      SET p.last_read_message_id = s.last_message_id,
          p.unread_count = 0
      WHERE p.last_read_message_id IS NULL`);
    return;
  }

  await context.sequelize.query(`UPDATE conversation_participants p
    SET p.unread_count = (
      SELECT COUNT(*) FROM messages m
      WHERE m.conversation_id = p.conversation_id AND m.sender_id <> p.user_id
    )
    WHERE p.last_read_message_id IS NULL`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query('DELETE FROM conversation_summaries');
  await context.sequelize.query(`UPDATE conversation_participants
    SET last_read_message_id = NULL, unread_count = 0`);
};
