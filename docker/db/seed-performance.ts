import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { z } from 'zod';
import { config } from '../../src/config';
import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import { connectMysql, disconnectMysql, sequelize } from '../../src/db/mysql';
import { MessageBodyModel, type MessageBody } from '../../src/models/message-body';
import { Conversation, ConversationParticipant, Message, User } from '../../src/models/sql';
import { hashMessageBody } from '../../src/services/message-body-hash';
import { verifyMessageBodyHashes } from './message-body-hash-backfill';

const performanceEnvironmentSchema = z
  .object({
    PERF_ENV_GUARD: z.literal('relay-perf'),
    PERF_USER_COUNT: z.coerce.number().int().min(2).max(10_000).default(100),
    PERF_CONVERSATION_COUNT: z.coerce.number().int().min(1).max(10_000).default(200),
    PERF_MESSAGES_PER_CONVERSATION: z.coerce.number().int().min(1).max(1_000).default(50),
    PERF_USER_PASSWORD: z.string().min(12).default('RelayPerf123!')
  })
  .refine(
    environment =>
      environment.PERF_CONVERSATION_COUNT * environment.PERF_MESSAGES_PER_CONVERSATION <= 100_000,
    { message: 'Performance dataset cannot exceed 100000 messages' }
  );

const performanceEnvironment = performanceEnvironmentSchema.parse(process.env);
const firstPerformanceId = 10_000;
const batchSize = 1_000;
const baseCreatedAt = Date.parse('2026-01-01T00:00:00.000Z');

interface PerformanceMessage {
  id: number;
  conversationId: number;
  senderId: number;
  clientId: string;
  bodyHash: string;
  createdAt: Date;
}

function parseConnectionUrl(connectionUrl: string): URL | null {
  try {
    return new URL(connectionUrl);
  } catch {
    return null;
  }
}

function isPerformanceMysqlUrl(connectionUrl: string): boolean {
  const url = parseConnectionUrl(connectionUrl);

  return !!(
    url &&
    url.protocol === 'mysql:' &&
    url.hostname === 'mysql' &&
    url.port === '3306' &&
    url.username === 'relay_perf' &&
    url.password === 'relay_perf' &&
    url.pathname === '/relay_perf'
  );
}

function isPerformanceMongoUrl(connectionUrl: string): boolean {
  const url = parseConnectionUrl(connectionUrl);

  return !!(
    url &&
    url.protocol === 'mongodb:' &&
    url.hostname === 'mongo' &&
    url.port === '27017' &&
    !url.username &&
    !url.password &&
    url.pathname === '/relay_perf'
  );
}

if (
  config.nodeEnv !== 'production' ||
  !isPerformanceMysqlUrl(config.mysqlUrl) ||
  !isPerformanceMongoUrl(config.mongoUrl)
) {
  throw new Error('Performance seed must use isolated relay_perf databases');
}

function chunk<T>(values: readonly T[]): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += batchSize) {
    chunks.push(values.slice(index, index + batchSize));
  }

  return chunks;
}

const userCount = performanceEnvironment.PERF_USER_COUNT;
const conversationCount = performanceEnvironment.PERF_CONVERSATION_COUNT;
const messagesPerConversation = performanceEnvironment.PERF_MESSAGES_PER_CONVERSATION;
const messageCount = conversationCount * messagesPerConversation;

async function readPerformanceCounts() {
  const [users, conversations, participants, messages, messageBodies] = await Promise.all([
    User.count({ where: { id: { [Op.gte]: firstPerformanceId } } }),
    Conversation.count({ where: { id: { [Op.gte]: firstPerformanceId } } }),
    ConversationParticipant.count({
      where: { conversationId: { [Op.gte]: firstPerformanceId } }
    }),
    Message.count({ where: { id: { [Op.gte]: firstPerformanceId } } }),
    MessageBodyModel.countDocuments({
      _id: { $gte: firstPerformanceId }
    })
  ]);

  return { users, conversations, participants, messages, messageBodies };
}

function hasCompleteDataset(counts: Awaited<ReturnType<typeof readPerformanceCounts>>): boolean {
  return (
    counts.users === userCount &&
    counts.conversations === conversationCount &&
    counts.participants === conversationCount * 2 &&
    counts.messages === messageCount &&
    counts.messageBodies === messageCount
  );
}

function hasAnyData(counts: Awaited<ReturnType<typeof readPerformanceCounts>>): boolean {
  return !!(
    counts.users ||
    counts.conversations ||
    counts.participants ||
    counts.messages ||
    counts.messageBodies
  );
}

async function seedPerformanceData(): Promise<void> {
  const existingCounts = await readPerformanceCounts();

  if (hasCompleteDataset(existingCounts)) {
    const verification = await verifyMessageBodyHashes();
    console.log(
      JSON.stringify({ performanceDataset: existingCounts, verification, status: 'already-seeded' })
    );
    return;
  }

  if (hasAnyData(existingCounts)) {
    throw new Error('Performance dataset is incomplete; reset the relay-perf Compose project');
  }

  const passwordHash = await bcrypt.hash(
    performanceEnvironment.PERF_USER_PASSWORD,
    config.auth.bcryptCost
  );
  const users = Array.from({ length: userCount }, (_, index) => ({
    id: firstPerformanceId + index,
    name: `Performance User ${index + 1}`,
    email: `performance-user-${index + 1}@example.com`,
    passwordHash
  }));
  const conversations = Array.from({ length: conversationCount }, (_, index) => {
    return {
      id: firstPerformanceId + index,
      createdByUserId: firstPerformanceId,
      clientId: `performance-conversation-${index + 1}`,
      title: `Performance Conversation ${index + 1}`,
      createdAt: new Date(baseCreatedAt + index * 60_000)
    };
  });
  const participants = conversations.flatMap((conversation, index) => {
    const partnerId = firstPerformanceId + 1 + (index % (userCount - 1));

    return [
      { conversationId: conversation.id, userId: conversation.createdByUserId },
      { conversationId: conversation.id, userId: partnerId }
    ];
  });
  const messages: PerformanceMessage[] = [];
  const messageBodies: MessageBody[] = [];

  for (let conversationIndex = 0; conversationIndex < conversationCount; conversationIndex++) {
    const conversation = conversations[conversationIndex];
    const conversationParticipants = participants.slice(
      conversationIndex * 2,
      conversationIndex * 2 + 2
    );

    for (let messageIndex = 0; messageIndex < messagesPerConversation; messageIndex++) {
      const datasetMessageIndex = conversationIndex * messagesPerConversation + messageIndex;
      const id = firstPerformanceId + datasetMessageIndex;
      const senderId = conversationParticipants[messageIndex % 2].userId;
      const body = `Performance message ${messageIndex + 1} in conversation ${conversationIndex + 1}`;
      const createdAt = new Date(conversation.createdAt.getTime() + messageIndex * 1_000);

      messages.push({
        id,
        conversationId: conversation.id,
        senderId,
        clientId: `performance-message-${id}`,
        bodyHash: hashMessageBody(body),
        createdAt
      });
      messageBodies.push({
        _id: id,
        conversationId: conversation.id,
        senderId,
        body,
        createdAt
      });
    }
  }

  await sequelize.transaction(async transaction => {
    await User.bulkCreate(users, { transaction });
    await Conversation.bulkCreate(conversations, { transaction });
    await ConversationParticipant.bulkCreate(participants, { transaction });

    for (const messageBatch of chunk(messages)) {
      await Message.bulkCreate(messageBatch, { transaction });
    }
  });

  for (const messageBodyBatch of chunk(messageBodies)) {
    await MessageBodyModel.insertMany(messageBodyBatch, { ordered: true });
  }

  const seededCounts = await readPerformanceCounts();
  if (!hasCompleteDataset(seededCounts)) {
    throw new Error('Performance dataset verification failed');
  }

  const verification = await verifyMessageBodyHashes();
  console.log(JSON.stringify({ performanceDataset: seededCounts, verification, status: 'seeded' }));
}

try {
  await connectMysql();
  await connectMongo();

  try {
    await seedPerformanceData();
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}
