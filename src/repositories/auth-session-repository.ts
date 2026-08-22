import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../db/mysql';
import { AuthSession, User } from '../models/sql';
import type { PublicUser } from './user-repository';

export interface AuthSessionDto {
  id: string;
  userId: number;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface ActiveAuthSession extends AuthSessionDto {
  user: PublicUser;
}

export interface NewAuthSession {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

export interface ReplacementAuthSession {
  id: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthSessionRepository {
  create(input: NewAuthSession, transaction?: Transaction): Promise<AuthSessionDto>;
  findActiveByTokenHash(tokenHash: string, now?: Date): Promise<ActiveAuthSession | null>;
  rotate(
    currentTokenHash: string,
    replacement: ReplacementAuthSession,
    rotatedAt?: Date
  ): Promise<ActiveAuthSession | null>;
  revokeByTokenHash(tokenHash: string, revokedAt?: Date): Promise<boolean>;
}

type AuthSessionWithUser = AuthSession & { user?: User };

function toAuthSessionDto(session: AuthSession): AuthSessionDto {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    replacedBySessionId: session.replacedBySessionId,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt
  };
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

function toActiveAuthSession(session: AuthSessionWithUser): ActiveAuthSession {
  if (!session.user) {
    throw new Error(`User for auth session ${session.id} was not loaded`);
  }

  return {
    ...toAuthSessionDto(session),
    user: toPublicUser(session.user)
  };
}

class SequelizeAuthSessionRepository implements AuthSessionRepository {
  async create(input: NewAuthSession, transaction?: Transaction): Promise<AuthSessionDto> {
    const session = await AuthSession.create(
      {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: new Date()
      },
      { transaction }
    );

    return toAuthSessionDto(session);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now = new Date()
  ): Promise<ActiveAuthSession | null> {
    const session = (await AuthSession.findOne({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { [Op.gt]: now }
      },
      include: [{ model: User, as: 'user', required: true }]
    })) as AuthSessionWithUser | null;

    return session ? toActiveAuthSession(session) : null;
  }

  async rotate(
    currentTokenHash: string,
    replacement: ReplacementAuthSession,
    rotatedAt = new Date()
  ): Promise<ActiveAuthSession | null> {
    return sequelize.transaction(async transaction => {
      const current = await AuthSession.scope('withRefreshTokenHash').findOne({
        where: { refreshTokenHash: currentTokenHash },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!current || current.revokedAt || current.expiresAt <= rotatedAt) return null;

      const next = await AuthSession.create(
        {
          id: replacement.id,
          userId: current.userId,
          refreshTokenHash: replacement.tokenHash,
          expiresAt: replacement.expiresAt,
          createdAt: rotatedAt
        },
        { transaction }
      );

      await current.update(
        {
          revokedAt: rotatedAt,
          replacedBySessionId: next.id,
          lastUsedAt: rotatedAt
        },
        { transaction }
      );

      const user = await User.findByPk(current.userId, { transaction });

      if (!user) {
        throw new Error(`User ${current.userId} for auth session ${current.id} was not found`);
      }

      return {
        ...toAuthSessionDto(next),
        user: toPublicUser(user)
      };
    });
  }

  async revokeByTokenHash(tokenHash: string, revokedAt = new Date()): Promise<boolean> {
    const [updatedCount] = await AuthSession.update(
      { revokedAt, lastUsedAt: revokedAt },
      {
        where: {
          refreshTokenHash: tokenHash,
          revokedAt: null
        }
      }
    );

    return updatedCount > 0;
  }
}

export const authSessionRepository: AuthSessionRepository = new SequelizeAuthSessionRepository();
