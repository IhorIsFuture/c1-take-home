import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { messageBodyRepository } from '../../src/repositories/message-body-repository';
import { demoMessageBodies } from './fixtures';
import { mysqlSeeder } from './migrator';

try {
  await connectMysql();
  const applied = await mysqlSeeder.up();

  if (!applied.length) {
    console.log('MySQL seeds are already up to date');
  } else {
    console.log(`applied MySQL seeds: ${applied.map(seed => seed.name).join(', ')}`);
  }
} finally {
  await disconnectMysql();
}

try {
  await connectMongo();
  await messageBodyRepository.ensureSeeded(demoMessageBodies);
  console.log('ensured demo message bodies exist');
} finally {
  await disconnectMongo();
}
