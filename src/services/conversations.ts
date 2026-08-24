import {
  conversationRepository,
  type ConversationDto
} from '../repositories/conversation-repository';
import { isDeadlockError } from '../db/errors';
import { HttpError } from '../errors/http-error';
import { conversationReadStateRepository } from '../repositories/conversation-read-state-repository';
import { messageMetadataRepository } from '../repositories/message-metadata-repository';
import { userRepository } from '../repositories/user-repository';

export interface ConversationReadStateDto {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}

export async function listConversations(userId: number): Promise<ConversationDto[]> {
  return conversationRepository.listByUserId(userId);
}

export async function createConversation(
  userId: number,
  title: string,
  participantIds: number[],
  clientId: string
) {
  const otherParticipantIds = [...new Set(participantIds)].filter(
    participantId => participantId !== userId
  );

  if (!otherParticipantIds.length) {
    throw new HttpError(
      400,
      'PARTICIPANT_REQUIRED',
      'A conversation must include at least one other participant'
    );
  }

  const allParticipantIds = [userId, ...otherParticipantIds].sort((left, right) => left - right);
  const existingParticipantIds = await userRepository.findExistingIds(allParticipantIds);

  if (existingParticipantIds.length !== allParticipantIds.length) {
    const existingParticipantIdSet = new Set(existingParticipantIds);
    throw new HttpError(422, 'PARTICIPANTS_NOT_FOUND', 'One or more participants do not exist', {
      participantIds: allParticipantIds.filter(
        participantId => !existingParticipantIdSet.has(participantId)
      )
    });
  }

  const result = await conversationRepository.createOrFind({
    title,
    participantIds: allParticipantIds,
    createdByUserId: userId,
    clientId
  });

  return {
    conversation: {
      id: result.conversation.id,
      title: result.conversation.title,
      participantIds: result.conversation.participantIds
    },
    created: result.created
  };
}

export async function markConversationRead(
  userId: number,
  conversationId: number,
  throughMessageId: number
): Promise<ConversationReadStateDto> {
  if (!(await conversationRepository.hasParticipant(conversationId, userId))) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  if (
    !(await messageMetadataRepository.messageBelongsToConversation(
      throughMessageId,
      conversationId
    ))
  ) {
    throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  }

  try {
    await conversationReadStateRepository.advanceCursor({
      conversationId,
      userId,
      throughMessageId
    });
  } catch (error) {
    if (!isDeadlockError(error)) throw error;
    await conversationReadStateRepository.advanceCursor({
      conversationId,
      userId,
      throughMessageId
    });
  }

  const readState = await conversationReadStateRepository.getReadState(conversationId, userId);

  if (!readState) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  return {
    conversationId,
    lastReadMessageId: readState.lastReadMessageId,
    unreadCount: readState.unreadCount
  };
}
