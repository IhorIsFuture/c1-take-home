import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import type { MessageBody } from '../../src/models/message-body';
import { messageBodyRepository } from '../../src/repositories/message-body-repository';

const demoBodies: MessageBody[] = [
  {
    _id: 1,
    conversationId: 1,
    senderId: 2,
    body: 'Hi, any update on order #1042?',
    createdAt: new Date()
  },
  {
    _id: 2,
    conversationId: 1,
    senderId: 1,
    body: 'Checking now — give me a minute.',
    createdAt: new Date()
  },
  {
    _id: 3,
    conversationId: 2,
    senderId: 3,
    body: 'Notes from the design sync are in the doc.',
    createdAt: new Date()
  }
];

try {
  await connectMongo();
  await messageBodyRepository.ensureSeeded(demoBodies);
  console.log('ensured demo message bodies exist');
} finally {
  await disconnectMongo();
}
