export interface CreateConversationInput {
  title: string;
  participantIds: number[];
  clientId: string;
}

export interface CreatedConversation {
  id: number;
  title: string;
  participantIds: number[];
}

export interface LastMessage {
  id: number;
  senderId: number;
  senderName: string;
  preview: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
}

export interface ConversationReadState {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}
