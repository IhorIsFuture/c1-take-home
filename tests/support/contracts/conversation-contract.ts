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
  createdAt: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  lastMessage: LastMessage | null;
  messageCount: number;
}
