import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { connectMongo, disconnectMongo } from '../../src/legacy/mongo';
import { isCleanReport, runLegacyBodyVerification } from './legacy-body-verification';

await connectMysql();

try {
  await connectMongo();

  try {
    const report = await runLegacyBodyVerification();
    const clean = isCleanReport(report);
    console.log(JSON.stringify({ legacyBodyVerification: report, clean }));
    if (!clean) process.exitCode = 1;
  } catch (error) {
    console.error('Legacy body verification failed', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}
