import {
  conversationRepository,
  type CreatedConversation,
  type ConversationDto
} from '../repositories/conversation-repository';

export async function listConversations(userId: number): Promise<ConversationDto[]> {
  return conversationRepository.listByUserId(userId);
}

export async function createConversation(
  title: string,
  participantIds: number[]
): Promise<CreatedConversation> {
  return conversationRepository.create({ title, participantIds });
}
