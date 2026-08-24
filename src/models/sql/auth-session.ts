import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  literal
} from 'sequelize';

export class AuthSession extends Model<
  InferAttributes<AuthSession>,
  InferCreationAttributes<AuthSession>
> {
  declare id: string;
  declare userId: number;
  declare refreshTokenHash: string;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare replacedBySessionId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date | null>;
}

export function initializeAuthSessionModel(sequelize: Sequelize): typeof AuthSession {
  AuthSession.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'user_id'
      },
      refreshTokenHash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        unique: true,
        field: 'refresh_token_hash'
      },
      expiresAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
        field: 'expires_at'
      },
      revokedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        field: 'revoked_at'
      },
      replacedBySessionId: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        field: 'replaced_by_session_id'
      },
      createdAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP(3)'),
        field: 'created_at'
      },
      lastUsedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        field: 'last_used_at'
      }
    },
    {
      sequelize,
      modelName: 'AuthSession',
      tableName: 'auth_sessions',
      timestamps: false,
      defaultScope: {
        attributes: { exclude: ['refreshTokenHash'] }
      },
      scopes: {
        withRefreshTokenHash: {
          attributes: [
            'id',
            'userId',
            'refreshTokenHash',
            'expiresAt',
            'revokedAt',
            'replacedBySessionId',
            'createdAt',
            'lastUsedAt'
          ]
        }
      }
    }
  );

  return AuthSession;
}
