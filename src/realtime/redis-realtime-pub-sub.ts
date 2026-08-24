import { createClient } from 'redis';
import { z } from 'zod';
import type {
  RealtimeDelivery,
  RealtimeEvent,
  RealtimeListener,
  RealtimePublisher
} from './realtime-publisher';

const publishedEventTtlSeconds = 24 * 60 * 60;

const publishOnceScript = `
if redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX') then
  return redis.call('PUBLISH', ARGV[2], ARGV[3])
end
return 0
`;

const messageCreatedEventSchema = z
  .object({
    type: z.literal('message.created'),
    message: z
      .object({
        id: z.number().int().positive(),
        conversationId: z.number().int().positive(),
        senderId: z.number().int().positive(),
        senderName: z.string().min(1),
        body: z.string(),
        createdAt: z.iso.datetime()
      })
      .strict()
  })
  .strict();

const typingEventSchema = z
  .object({
    type: z.literal('typing'),
    typing: z
      .object({
        conversationId: z.number().int().positive(),
        userId: z.number().int().positive(),
        userName: z.string().min(1)
      })
      .strict()
  })
  .strict();

const conversationCreatedEventSchema = z
  .object({
    type: z.literal('conversation.created'),
    conversation: z
      .object({
        id: z.number().int().positive(),
        title: z.string().min(1)
      })
      .strict()
  })
  .strict();

const realtimeEnvelopeSchema = z
  .object({
    version: z.literal(1),
    recipientUserIds: z.array(z.number().int().positive()).min(1),
    event: z.discriminatedUnion('type', [
      messageCreatedEventSchema,
      typingEventSchema,
      conversationCreatedEventSchema
    ])
  })
  .strict();

type RedisClient = ReturnType<typeof createClient>;
type RedisSubscriberLifecycleHook = () => void | Promise<void>;

export interface RedisRealtimePubSubOptions {
  url: string;
  namespace: string;
  onError?: (error: unknown) => void;
  onSubscriberUnavailable?: RedisSubscriberLifecycleHook;
  onSubscriberRecovered?: RedisSubscriberLifecycleHook;
}

function serializeDelivery(delivery: RealtimeDelivery): string {
  return JSON.stringify({
    version: 1,
    recipientUserIds: [...new Set(delivery.recipientUserIds)],
    event: delivery.event
  });
}

function parseDelivery(message: string): RealtimeDelivery {
  const envelope = realtimeEnvelopeSchema.parse(JSON.parse(message));

  if (envelope.event.type !== 'message.created') {
    return { recipientUserIds: envelope.recipientUserIds, event: envelope.event };
  }

  return {
    recipientUserIds: envelope.recipientUserIds,
    event: {
      ...envelope.event,
      message: {
        ...envelope.event.message,
        createdAt: new Date(envelope.event.message.createdAt)
      }
    }
  };
}

async function closeClient(client: RedisClient): Promise<void> {
  if (!client.isOpen) return;
  await client.quit();
}

export class RedisRealtimePubSub implements RealtimePublisher {
  private readonly publisher: RedisClient;
  private readonly subscriber: RedisClient;
  private readonly reportError: (error: unknown) => void;
  private readonly onSubscriberUnavailable?: RedisSubscriberLifecycleHook;
  private readonly onSubscriberRecovered?: RedisSubscriberLifecycleHook;
  private readonly channel: string;
  private readonly eventKeyPrefix: string;
  private listener?: RealtimeListener;
  private startPromise?: Promise<void>;
  private closePromise?: Promise<void>;
  private subscriberUnavailable = false;

  constructor(options: RedisRealtimePubSubOptions) {
    this.publisher = createClient({ url: options.url });
    this.subscriber = this.publisher.duplicate();
    this.reportError = options.onError ?? (error => console.error('Redis realtime error', error));
    this.onSubscriberUnavailable = options.onSubscriberUnavailable;
    this.onSubscriberRecovered = options.onSubscriberRecovered;
    this.channel = `${options.namespace}:realtime:v1`;
    this.eventKeyPrefix = `${options.namespace}:realtime:published`;
    this.publisher.on('error', this.reportError);
    this.subscriber.on('error', this.reportError);
    this.subscriber.on('reconnecting', () => this.handleSubscriberUnavailable());
    this.subscriber.on('ready', () => this.handleSubscriberRecovered());
  }

  start(listener: RealtimeListener): Promise<void> {
    if (this.closePromise) throw new Error('Redis realtime Pub/Sub is closing');
    if (this.listener && this.listener !== listener) {
      throw new Error('Redis realtime Pub/Sub already has a listener');
    }

    this.listener = listener;
    this.startPromise ??= this.connect();
    return this.startPromise;
  }

  async publish(event: RealtimeEvent, recipientUserIds: readonly number[]): Promise<void> {
    const uniqueRecipientUserIds = [...new Set(recipientUserIds)];
    if (!uniqueRecipientUserIds.length) return;
    if (!this.publisher.isReady) throw new Error('Redis realtime publisher is not ready');

    const delivery = serializeDelivery({ event, recipientUserIds: uniqueRecipientUserIds });

    if (event.type !== 'message.created') {
      await this.publisher.publish(this.channel, delivery);
      return;
    }

    await this.publisher.eval(publishOnceScript, {
      keys: [`${this.eventKeyPrefix}:${event.type}:${event.message.id}`],
      arguments: [String(publishedEventTtlSeconds), this.channel, delivery]
    });
  }

  async isReady(): Promise<boolean> {
    if (!this.publisher.isReady || !this.subscriber.isReady || !this.listener) return false;

    try {
      return (await this.publisher.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.disconnect();
    return this.closePromise;
  }

  private async connect(): Promise<void> {
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.subscriber.subscribe(this.channel, message => this.handleMessage(message));
    } catch (error) {
      await Promise.allSettled([closeClient(this.publisher), closeClient(this.subscriber)]);
      throw error;
    }
  }

  private handleMessage(message: string): void {
    let delivery: RealtimeDelivery;

    try {
      delivery = parseDelivery(message);
    } catch (error) {
      this.reportError(error);
      return;
    }

    Promise.resolve(this.listener?.(delivery)).catch(this.reportError);
  }

  private handleSubscriberUnavailable(): void {
    if (this.subscriberUnavailable) return;
    this.subscriberUnavailable = true;
    this.runLifecycleHook(this.onSubscriberUnavailable);
  }

  private handleSubscriberRecovered(): void {
    if (!this.subscriberUnavailable) return;
    this.subscriberUnavailable = false;
    this.runLifecycleHook(this.onSubscriberRecovered);
  }

  private runLifecycleHook(hook?: RedisSubscriberLifecycleHook): void {
    if (!hook) return;
    void Promise.resolve().then(hook).catch(this.reportError);
  }

  private async disconnect(): Promise<void> {
    this.listener = undefined;
    const unsubscribeResults = await Promise.allSettled([
      ...(this.subscriber.isReady ? [this.subscriber.unsubscribe(this.channel)] : [])
    ]);
    const closeResults = await Promise.allSettled([
      closeClient(this.subscriber),
      closeClient(this.publisher)
    ]);
    const errors = [...unsubscribeResults, ...closeResults]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    if (errors.length) throw new AggregateError(errors, 'Failed to close Redis realtime Pub/Sub');
  }
}
