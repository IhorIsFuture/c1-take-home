import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { connectMongo, disconnectMongo } from '../../src/legacy/mongo';
import { runLegacyBodyBackfill } from './legacy-body-backfill';

await connectMysql();

try {
  await connectMongo();

  try {
    const result = await runLegacyBodyBackfill();
    console.log(JSON.stringify({ legacyBodyBackfill: result }));
  } catch (error) {
    console.error('Legacy body backfill failed', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}
