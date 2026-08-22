import mongoose, { type Connection } from 'mongoose';
import { testEnvironment } from '../test-environment';

let connection: Connection | undefined;

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

export async function closeMongoTestStore(): Promise<void> {
  if (!connection) return;

  const activeConnection = connection;
  connection = undefined;
  await activeConnection.close();
}
