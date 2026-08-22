export interface CreateMessageInput {
  conversationId: number;
  body: string;
  clientId: string;
}

export interface MessageResponse {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
}
