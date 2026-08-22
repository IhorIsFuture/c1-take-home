import type { MessageBody } from '../../src/models/message-body';
import { hashMessageBody } from '../../src/services/message-body-hash';

export const demoUsers = [
  {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2'
  },
  {
    id: 2,
    name: 'Bob',
    email: 'bob@example.com',
    passwordHash: '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2'
  },
  {
    id: 3,
    name: 'Carol',
    email: 'carol@example.com',
    passwordHash: '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2'
  }
];

const demoCreatedAt = new Date('2026-08-21T16:57:10.637Z');

export const demoConversations = [
  {
    id: 1,
    createdByUserId: 1,
    clientId: 'legacy-1',
    title: 'Support — order #1042',
    createdAt: demoCreatedAt
  },
  {
    id: 2,
    createdByUserId: 1,
    clientId: 'legacy-2',
    title: 'Design sync',
    createdAt: demoCreatedAt
  }
];

export const demoConversationParticipants = [
  { conversationId: 1, userId: 1 },
  { conversationId: 1, userId: 2 },
  { conversationId: 2, userId: 1 },
  { conversationId: 2, userId: 3 }
];

const demoMessageFixtures = [
  {
    id: 1,
    conversationId: 1,
    senderId: 2,
    body: 'Hi, any update on order #1042?',
    createdAt: demoCreatedAt
  },
  {
    id: 2,
    conversationId: 1,
    senderId: 1,
    body: 'Checking now — give me a minute.',
    createdAt: demoCreatedAt
  },
  {
    id: 3,
    conversationId: 2,
    senderId: 3,
    body: 'Notes from the design sync are in the doc.',
    createdAt: demoCreatedAt
  }
];

export const demoMessages = demoMessageFixtures.map(({ body, ...message }) => ({
  ...message,
  clientId: null,
  bodyHash: hashMessageBody(body)
}));

export const demoMessageBodies: MessageBody[] = demoMessageFixtures.map(
  ({ id, body, ...message }) => ({
    _id: id,
    ...message,
    body
  })
);
