import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  literal
} from 'sequelize';

export class Conversation extends Model<
  InferAttributes<Conversation>,
  InferCreationAttributes<Conversation>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare createdAt: CreationOptional<Date>;
}

export function initializeConversationModel(sequelize: Sequelize): typeof Conversation {
  Conversation.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false
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
      modelName: 'Conversation',
      tableName: 'conversations',
      timestamps: false
    }
  );

  return Conversation;
}
