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

export interface RealtimePublisher {
  publish(event: MessageCreatedEvent): Promise<void>;
}
