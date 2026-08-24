import bcrypt from 'bcrypt';
import { config } from '../../../src/config';
import { User } from '../../../src/models/sql';
import { demoUsers } from '../fixtures';
import type { DatabaseSeed } from '../migrator';

const disabledPasswordHash = '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2';
const defaultDemoPassword = 'RelayDemo123!';

export const up: DatabaseSeed = async ({ context: sequelize }) => {
  const password = process.env.DEMO_USER_PASSWORD ?? defaultDemoPassword;
  const passwordHashes = await Promise.all(
    demoUsers.map(async user => ({
      id: user.id,
      passwordHash: await bcrypt.hash(password, config.auth.bcryptCost)
    }))
  );

  await sequelize.transaction(async transaction => {
    for (const user of passwordHashes) {
      const [updatedCount] = await User.update(
        { passwordHash: user.passwordHash },
        { where: { id: user.id }, transaction }
      );

      if (updatedCount !== 1) {
        throw new Error(`Demo user ${user.id} was not found`);
      }
    }
  });
};

export const down: DatabaseSeed = async ({ context: sequelize }) => {
  await sequelize.transaction(async transaction => {
    await User.update(
      { passwordHash: disabledPasswordHash },
      { where: { id: demoUsers.map(user => user.id) }, transaction }
    );
  });
};
