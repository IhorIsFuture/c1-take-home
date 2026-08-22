import { Op } from 'sequelize';
import { Conversation, ConversationParticipant, Message, User } from '../../../src/models/sql';
import {
  demoConversationParticipants,
  demoConversations,
  demoMessages,
  demoUsers
} from '../fixtures';
import type { DatabaseSeed } from '../migrator';

export const up: DatabaseSeed = async ({ context: sequelize }) => {
  await sequelize.transaction(async transaction => {
    await User.bulkCreate(demoUsers, {
      updateOnDuplicate: ['name', 'email'],
      transaction
    });

    await Conversation.bulkCreate(demoConversations, {
      updateOnDuplicate: ['title', 'createdAt'],
      transaction
    });

    await ConversationParticipant.bulkCreate(demoConversationParticipants, {
      ignoreDuplicates: true,
      transaction
    });

    await Message.bulkCreate(demoMessages, {
      updateOnDuplicate: ['conversationId', 'senderId', 'clientId', 'bodyHash', 'createdAt'],
      transaction
    });
  });
};

export const down: DatabaseSeed = async ({ context: sequelize }) => {
  await sequelize.transaction(async transaction => {
    await Message.destroy({
      where: { id: { [Op.in]: demoMessages.map(message => message.id) } },
      transaction
    });

    await ConversationParticipant.destroy({
      where: {
        [Op.or]: demoConversationParticipants.map(participant => ({
          conversationId: participant.conversationId,
          userId: participant.userId
        }))
      },
      transaction
    });

    await Conversation.destroy({
      where: { id: { [Op.in]: demoConversations.map(conversation => conversation.id) } },
      transaction
    });

    await User.destroy({
      where: { id: { [Op.in]: demoUsers.map(user => user.id) } },
      transaction
    });
  });
};
