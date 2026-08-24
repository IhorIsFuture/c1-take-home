import { conversationRepository } from '../repositories/conversation-repository';
import { userRepository } from '../repositories/user-repository';
import type { RealtimePublisher } from '../realtime/index';

export async function broadcastTyping(
  userId: number,
  conversationId: number,
  realtimePublisher: RealtimePublisher
): Promise<void> {
  const participantIds = await conversationRepository.listParticipantIds(conversationId);

  if (!participantIds.includes(userId)) return;

  const recipientUserIds = participantIds.filter(participantId => participantId !== userId);

  if (!recipientUserIds.length) return;

  const sender = await userRepository.findPublicById(userId);

  if (!sender) return;

  await realtimePublisher.publish(
    { type: 'typing', typing: { conversationId, userId, userName: sender.name } },
    recipientUserIds
  );
}
