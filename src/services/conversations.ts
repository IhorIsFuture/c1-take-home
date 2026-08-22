import {
  conversationRepository,
  type ConversationDto
} from '../repositories/conversation-repository';
import { HttpError } from '../errors/http-error';
import { userRepository } from '../repositories/user-repository';

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
