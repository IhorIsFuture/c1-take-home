import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { messageBodyRepository } from '../../src/repositories/message-body-repository';
import { demoMessageBodies } from './fixtures';
import { databaseSeeder } from './migrator';

try {
  await connectMysql();
  await connectMongo();

  try {
    await messageBodyRepository.ensureSeeded(demoMessageBodies);
    console.log('ensured demo message bodies exist');

    const applied = await databaseSeeder.up();

    if (!applied.length) {
      console.log('database seeds are already up to date');
    } else {
      console.log(`applied database seeds: ${applied.map(seed => seed.name).join(', ')}`);
    }
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}
