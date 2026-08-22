import type { MessageCreatedEvent, RealtimePublisher } from './realtime-publisher';

type ConversationBroadcast = (conversationId: number, payload: unknown) => void;

export class InProcessRealtimePublisher implements RealtimePublisher {
  constructor(private readonly broadcast: ConversationBroadcast) {}

  async publish(event: MessageCreatedEvent): Promise<void> {
    this.broadcast(event.message.conversationId, {
      type: 'message',
      ...event.message
    });
  }
}
