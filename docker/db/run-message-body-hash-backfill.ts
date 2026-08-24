import { connectMongo, disconnectMongo } from '../../src/legacy/mongo';
import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { backfillMessageBodyHashes, verifyMessageBodyHashes } from './message-body-hash-backfill';

await connectMysql();

try {
  await connectMongo();

  try {
    const backfill = await backfillMessageBodyHashes();
    const verification = await verifyMessageBodyHashes();
    console.log(JSON.stringify({ backfill, verification }));
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}
