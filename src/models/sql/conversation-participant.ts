import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize
} from 'sequelize';

export class ConversationParticipant extends Model<
  InferAttributes<ConversationParticipant>,
  InferCreationAttributes<ConversationParticipant>
> {
  declare conversationId: number;
  declare userId: number;
  declare lastReadMessageId: CreationOptional<number | null>;
  declare unreadCount: CreationOptional<number>;
}

export function initializeConversationParticipantModel(
  sequelize: Sequelize
): typeof ConversationParticipant {
  ConversationParticipant.init(
    {
      conversationId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        field: 'conversation_id'
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        field: 'user_id'
      },
      lastReadMessageId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'last_read_message_id'
      },
      unreadCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: 'unread_count'
      }
    },
    {
      sequelize,
      modelName: 'ConversationParticipant',
      tableName: 'conversation_participants',
      timestamps: false
    }
  );

  return ConversationParticipant;
}
