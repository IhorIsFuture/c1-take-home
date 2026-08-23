export interface RealtimeMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: Date;
}

export interface MessageCreatedEvent {
  type: 'message.created';
  message: RealtimeMessage;
}

export interface RealtimeDelivery {
  recipientUserIds: readonly number[];
  event: MessageCreatedEvent;
}

export type RealtimeListener = (delivery: RealtimeDelivery) => void | Promise<void>;

export interface RealtimePublisher {
  publish(event: MessageCreatedEvent, recipientUserIds: readonly number[]): Promise<void>;
}
