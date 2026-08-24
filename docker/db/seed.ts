import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { databaseSeeder } from './migrator';

try {
  await connectMysql();
  const applied = await databaseSeeder.up();

  if (!applied.length) {
    console.log('database seeds are already up to date');
  } else {
    console.log(`applied database seeds: ${applied.map(seed => seed.name).join(', ')}`);
  }
} finally {
  await disconnectMysql();
}
