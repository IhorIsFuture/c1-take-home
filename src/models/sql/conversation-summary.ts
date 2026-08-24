import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize
} from 'sequelize';

export class ConversationSummary extends Model<
  InferAttributes<ConversationSummary>,
  InferCreationAttributes<ConversationSummary>
> {
  declare conversationId: number;
  declare lastMessageId: CreationOptional<number | null>;
  declare lastMessageAt: CreationOptional<Date | null>;
  declare lastSenderId: CreationOptional<number | null>;
  declare lastMessagePreview: CreationOptional<string | null>;
}

export function initializeConversationSummaryModel(
  sequelize: Sequelize
): typeof ConversationSummary {
  ConversationSummary.init(
    {
      conversationId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        field: 'conversation_id'
      },
      lastMessageId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'last_message_id'
      },
      lastMessageAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        field: 'last_message_at'
      },
      lastSenderId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        field: 'last_sender_id'
      },
      lastMessagePreview: {
        type: DataTypes.STRING(300),
        allowNull: true,
        defaultValue: null,
        field: 'last_message_preview'
      }
    },
    {
      sequelize,
      modelName: 'ConversationSummary',
      tableName: 'conversation_summaries',
      timestamps: false
    }
  );

  return ConversationSummary;
}
