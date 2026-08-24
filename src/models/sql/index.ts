import type { Sequelize } from 'sequelize';
import { AuthSession, initializeAuthSessionModel } from './auth-session';
import { Conversation, initializeConversationModel } from './conversation';
import {
  ConversationParticipant,
  initializeConversationParticipantModel
} from './conversation-participant';
import { ConversationSummary, initializeConversationSummaryModel } from './conversation-summary';
import { initializeMessageModel, Message } from './message';
import { initializeMessageBodyModel, MessageBody } from './message-body';
import { initializeUserModel, User } from './user';

export {
  AuthSession,
  Conversation,
  ConversationParticipant,
  ConversationSummary,
  Message,
  MessageBody,
  User
};

export function initializeSqlModels(sequelize: Sequelize): void {
  initializeUserModel(sequelize);
  initializeConversationModel(sequelize);
  initializeConversationParticipantModel(sequelize);
  initializeConversationSummaryModel(sequelize);
  initializeMessageModel(sequelize);
  initializeMessageBodyModel(sequelize);
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

  Conversation.hasOne(ConversationSummary, { as: 'summary', foreignKey: 'conversationId' });
  ConversationSummary.belongsTo(Conversation, { foreignKey: 'conversationId' });

  Conversation.hasMany(Message, { foreignKey: 'conversationId' });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId' });
  User.hasMany(Message, { as: 'messages', foreignKey: 'senderId' });
  Message.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });

  Message.hasOne(MessageBody, { as: 'bodyRow', foreignKey: 'messageId' });
  MessageBody.belongsTo(Message, { foreignKey: 'messageId' });

  User.hasMany(AuthSession, { as: 'authSessions', foreignKey: 'userId' });
  AuthSession.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  AuthSession.belongsTo(AuthSession, {
    as: 'replacement',
    foreignKey: 'replacedBySessionId'
  });
}
