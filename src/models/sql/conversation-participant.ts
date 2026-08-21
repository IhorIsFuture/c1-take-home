import { DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class ConversationParticipant extends Model<
  InferAttributes<ConversationParticipant>,
  InferCreationAttributes<ConversationParticipant>
> {
  declare conversationId: number;
  declare userId: number;
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
