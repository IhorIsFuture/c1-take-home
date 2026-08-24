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

export interface TypingEventPayload {
  conversationId: number;
  userId: number;
  userName: string;
}

export interface TypingEvent {
  type: 'typing';
  typing: TypingEventPayload;
}

export type RealtimeEvent = MessageCreatedEvent | TypingEvent;

export interface RealtimeDelivery {
  recipientUserIds: readonly number[];
  event: RealtimeEvent;
}

export type RealtimeListener = (delivery: RealtimeDelivery) => void | Promise<void>;

export interface RealtimePublisher {
  publish(event: RealtimeEvent, recipientUserIds: readonly number[]): Promise<void>;
}
