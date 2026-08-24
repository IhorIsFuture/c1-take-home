import { DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class MessageBody extends Model<
  InferAttributes<MessageBody>,
  InferCreationAttributes<MessageBody>
> {
  declare messageId: number;
  declare body: string;
}

export function initializeMessageBodyModel(sequelize: Sequelize): typeof MessageBody {
  MessageBody.init(
    {
      messageId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        field: 'message_id'
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'MessageBody',
      tableName: 'message_bodies',
      timestamps: false
    }
  );

  return MessageBody;
}
