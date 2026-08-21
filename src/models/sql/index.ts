import type { Sequelize } from 'sequelize';
import { Conversation, initializeConversationModel } from './conversation';
import {
  ConversationParticipant,
  initializeConversationParticipantModel
} from './conversation-participant';
import { initializeMessageModel, Message } from './message';
import { initializeUserModel, User } from './user';

export { Conversation, ConversationParticipant, Message, User };

export function initializeSqlModels(sequelize: Sequelize): void {
  initializeUserModel(sequelize);
  initializeConversationModel(sequelize);
  initializeConversationParticipantModel(sequelize);
  initializeMessageModel(sequelize);

  User.belongsToMany(Conversation, {
    through: ConversationParticipant,
    foreignKey: 'userId',
    otherKey: 'conversationId'
  });
  Conversation.belongsToMany(User, {
    through: ConversationParticipant,
    foreignKey: 'conversationId',
    otherKey: 'userId'
  });

  Conversation.hasMany(ConversationParticipant, { foreignKey: 'conversationId' });
  ConversationParticipant.belongsTo(Conversation, { foreignKey: 'conversationId' });
  User.hasMany(ConversationParticipant, { foreignKey: 'userId' });
  ConversationParticipant.belongsTo(User, { foreignKey: 'userId' });

  Conversation.hasMany(Message, { foreignKey: 'conversationId' });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId' });
  User.hasMany(Message, { foreignKey: 'senderId' });
  Message.belongsTo(User, { foreignKey: 'senderId' });
}
