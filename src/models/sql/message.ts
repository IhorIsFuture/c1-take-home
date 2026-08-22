import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Sequelize,
  literal
} from 'sequelize';
import type { User } from './user';

export class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  declare id: CreationOptional<number>;
  declare conversationId: number;
  declare senderId: number;
  declare clientId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare sender?: NonAttribute<User>;
}

export function initializeMessageModel(sequelize: Sequelize): typeof Message {
  Message.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      conversationId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'conversation_id'
      },
      senderId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'sender_id'
      },
      clientId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'client_id'
      },
      createdAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP(3)'),
        field: 'created_at'
      }
    },
    {
      sequelize,
      modelName: 'Message',
      tableName: 'messages',
      timestamps: false
    }
  );

  return Message;
}
