import mongoose, { type Connection } from 'mongoose';
import { testEnvironment } from '../test-environment';

let connection: Connection | undefined;

export interface StoredMessageBody {
  _id: number;
  conversationId: number;
  senderId: number;
  body: string;
  signature?: string;
  createdAt: Date;
}

async function getConnection(): Promise<Connection> {
  connection ??= await mongoose
    .createConnection(testEnvironment.mongoUrl, {
      serverSelectionTimeoutMS: 5_000
    })
    .asPromise();

  return connection;
}

export async function resetMongoTestData(): Promise<void> {
  const database = (await getConnection()).db;

  if (!database) throw new Error('Mongo test database is not connected');

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();

  await Promise.all(
    collections
      .filter(collection => !collection.name.startsWith('system.'))
      .map(collection => database.collection(collection.name).deleteMany({}))
  );
}

export async function findStoredMessageBody(messageId: number): Promise<StoredMessageBody | null> {
  const database = (await getConnection()).db;

  if (!database) throw new Error('Mongo test database is not connected');

  return database.collection<StoredMessageBody>('message_bodies').findOne({ _id: messageId });
}

export async function countStoredMessageBodies(): Promise<number> {
  const database = (await getConnection()).db;

  if (!database) throw new Error('Mongo test database is not connected');

  return database.collection('message_bodies').countDocuments();
}

export async function closeMongoTestStore(): Promise<void> {
  if (!connection) return;

  const activeConnection = connection;
  connection = undefined;
  await activeConnection.close();
}
