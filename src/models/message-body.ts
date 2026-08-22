import mongoose, { type Model } from 'mongoose';

export interface MessageBody {
  _id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: Date;
}

const messageBodySchema = new mongoose.Schema<MessageBody>(
  {
    _id: { type: Number, required: true },
    conversationId: { type: Number, required: true },
    senderId: { type: Number, required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, required: true }
  },
  {
    collection: 'message_bodies',
    versionKey: false,
    bufferCommands: false
  }
);

export const MessageBodyModel =
  (mongoose.models.MessageBody as Model<MessageBody> | undefined) ??
  mongoose.model<MessageBody>('MessageBody', messageBodySchema);
