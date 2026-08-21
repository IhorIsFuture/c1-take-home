import { connectMysql, disconnectMysql } from '../../src/db/mysql';
import { mysqlMigrator } from './migrator';

try {
  await connectMysql();
  const applied = await mysqlMigrator.up();

  if (!applied.length) {
    console.log('MySQL migrations are already up to date');
  } else {
    console.log(`applied MySQL migrations: ${applied.map(migration => migration.name).join(', ')}`);
  }
} finally {
  await disconnectMysql();
}
