import mongoose from 'mongoose';
import { config } from '../config';

const retryDelayMs = 1500;

export async function connectMongo(retries = 20): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.mongoUrl, {
        serverSelectionTimeoutMS: retryDelayMs
      });
      return;
    } catch (error) {
      lastError = error;
      await mongoose.disconnect().catch(() => undefined);

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw new Error('mongo not reachable', { cause: lastError });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export async function isMongoReady(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;

  try {
    await mongoose.connection.db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
