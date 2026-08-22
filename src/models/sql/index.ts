import type { Sequelize } from 'sequelize';
import { AuthSession, initializeAuthSessionModel } from './auth-session';
import { Conversation, initializeConversationModel } from './conversation';
import {
  ConversationParticipant,
  initializeConversationParticipantModel
} from './conversation-participant';
import { initializeMessageModel, Message } from './message';
import { initializeUserModel, User } from './user';

export { AuthSession, Conversation, ConversationParticipant, Message, User };

export function initializeSqlModels(sequelize: Sequelize): void {
  initializeUserModel(sequelize);
  initializeConversationModel(sequelize);
  initializeConversationParticipantModel(sequelize);
  initializeMessageModel(sequelize);
  initializeAuthSessionModel(sequelize);

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

  User.hasMany(Conversation, { as: 'createdConversations', foreignKey: 'createdByUserId' });
  Conversation.belongsTo(User, { as: 'creator', foreignKey: 'createdByUserId' });

  Conversation.hasMany(Message, { foreignKey: 'conversationId' });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId' });
  User.hasMany(Message, { as: 'messages', foreignKey: 'senderId' });
  Message.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });

  User.hasMany(AuthSession, { as: 'authSessions', foreignKey: 'userId' });
  AuthSession.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  AuthSession.belongsTo(AuthSession, {
    as: 'replacement',
    foreignKey: 'replacedBySessionId'
  });
}
