import { WebSocket, type RawData } from 'ws';

interface FrameWaiter<Frame = unknown> {
  predicate: (frame: unknown) => boolean;
  resolve: (frame: Frame) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function decodeFrame(raw: RawData): unknown {
  const value = Array.isArray(raw)
    ? Buffer.concat(raw).toString('utf8')
    : raw instanceof ArrayBuffer
      ? Buffer.from(raw).toString('utf8')
      : raw.toString('utf8');

  return JSON.parse(value);
}

export class TestWebSocketClient {
  private readonly frames: unknown[] = [];
  private readonly waiters = new Set<FrameWaiter>();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', raw => this.handleFrame(raw));
    socket.on('close', () => this.rejectWaiters(new Error('WebSocket closed')));
    socket.on('error', error => this.rejectWaiters(error));
  }

  static async connect(url: string, accessToken: string): Promise<TestWebSocketClient> {
    const socket = new WebSocket(url);
    const client = new TestWebSocketClient(socket);

    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    const authenticated = client.waitForFrame<{ type: string }>(
      frame =>
        !!frame && typeof frame === 'object' && 'type' in frame && frame.type === 'authenticated'
    );
    socket.send(JSON.stringify({ type: 'authenticate', accessToken }));
    await authenticated;
    return client;
  }

  waitForFrame<Frame>(predicate: (frame: unknown) => boolean, timeoutMs = 2_000): Promise<Frame> {
    const frameIndex = this.frames.findIndex(predicate);

    if (frameIndex >= 0) {
      const [frame] = this.frames.splice(frameIndex, 1);
      return Promise.resolve(frame as Frame);
    }

    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter<Frame> = {
        predicate,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter as FrameWaiter);
          reject(new Error(`WebSocket frame was not received within ${timeoutMs}ms`));
        }, timeoutMs)
      };

      this.waiters.add(waiter as FrameWaiter);
    });
  }

  expectNoFrame(predicate: (frame: unknown) => boolean, durationMs = 250): Promise<void> {
    const existingFrame = this.frames.find(predicate);

    if (existingFrame) {
      return Promise.reject(
        new Error(`Unexpected WebSocket frame: ${JSON.stringify(existingFrame)}`)
      );
    }

    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter = {
        predicate,
        resolve: frame => reject(new Error(`Unexpected WebSocket frame: ${JSON.stringify(frame)}`)),
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve();
        }, durationMs)
      };

      this.waiters.add(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;

    await new Promise<void>(resolve => {
      this.socket.once('close', resolve);
      this.socket.close(1000, 'Test complete');
    });
  }

  private handleFrame(raw: RawData): void {
    let frame: unknown;

    try {
      frame = decodeFrame(raw);
    } catch {
      return;
    }

    for (const waiter of this.waiters) {
      if (!waiter.predicate(frame)) continue;
      clearTimeout(waiter.timeout);
      this.waiters.delete(waiter);
      waiter.resolve(frame);
      return;
    }

    this.frames.push(frame);
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }

    this.waiters.clear();
  }
}
