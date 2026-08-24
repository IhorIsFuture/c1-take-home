import { Op, type Transaction } from 'sequelize';
import { User } from '../models/sql';

export interface PublicUser {
  id: number;
  name: string;
  email: string;
}

export interface UserCredentials extends PublicUser {
  passwordHash: string;
}

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  findByNormalizedEmail(email: string): Promise<UserCredentials | null>;
  findPublicById(id: number): Promise<PublicUser | null>;
  create(input: NewUser, transaction?: Transaction): Promise<PublicUser>;
  search(
    query: string,
    excludeUserId: number,
    limit: number,
    offset: number
  ): Promise<PublicUser[]>;
  findExistingIds(ids: readonly number[]): Promise<number[]>;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

class SequelizeUserRepository implements UserRepository {
  async findByNormalizedEmail(email: string): Promise<UserCredentials | null> {
    const user = await User.scope('withPasswordHash').findOne({
      where: { email: email.trim().toLowerCase() }
    });

    if (!user) return null;

    return {
      ...toPublicUser(user),
      passwordHash: user.passwordHash
    };
  }

  async findPublicById(id: number): Promise<PublicUser | null> {
    const user = await User.findByPk(id);
    return user ? toPublicUser(user) : null;
  }

  async create(input: NewUser, transaction?: Transaction): Promise<PublicUser> {
    const user = await User.create(
      {
        name: input.name,
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash
      },
      { transaction }
    );

    return toPublicUser(user);
  }

  async search(
    query: string,
    excludeUserId: number,
    limit: number,
    offset: number
  ): Promise<PublicUser[]> {
    const escapedQuery = query.trim().replace(/[\\%_]/g, '\\$&');
    const users = await User.findAll({
      where: {
        id: { [Op.ne]: excludeUserId },
        [Op.or]: [
          { name: { [Op.like]: `%${escapedQuery}%` } },
          { email: { [Op.like]: `%${escapedQuery.toLowerCase()}%` } }
        ]
      },
      order: [
        ['name', 'ASC'],
        ['id', 'ASC']
      ],
      limit: Math.max(1, Math.min(limit, 50)),
      offset
    });

    return users.map(toPublicUser);
  }

  async findExistingIds(ids: readonly number[]): Promise<number[]> {
    const uniqueIds = [...new Set(ids)];

    if (!uniqueIds.length) return [];

    const users = await User.findAll({
      attributes: ['id'],
      where: { id: { [Op.in]: uniqueIds } },
      order: [['id', 'ASC']],
      raw: true
    });

    return users.map(user => user.id);
  }
}

export const userRepository: UserRepository = new SequelizeUserRepository();
