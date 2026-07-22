import { HeartbeatPayload, HeartbeatQueueConfig } from './types';
import { postHeartbeats } from './http-client';

const DEFAULT_DEBOUNCE_MS = 2 * 60 * 1000;       // 2 minutes per file
const DEFAULT_FLUSH_INTERVAL_MS = 30 * 1000;      // 30 seconds
const DEFAULT_BACKOFF_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_QUEUE_SIZE = 500;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

export class HeartbeatQueue {
  private queue: HeartbeatPayload[] = [];
  private lastHeartbeats: Map<string, number> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private consecutiveFailures = 0;
  private disposed = false;

  private readonly debounceMs: number;
  private readonly flushIntervalMs: number;
  private readonly backoffIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly maxConsecutiveFailures: number;

  constructor(private readonly config: HeartbeatQueueConfig) {
    this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.backoffIntervalMs = config.backoffIntervalMs ?? DEFAULT_BACKOFF_INTERVAL_MS;
    this.maxQueueSize = config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  }

  start(): void {
    this.scheduleFlush();
  }

  /**
   * Enqueue a heartbeat for a file event.
   * Returns false if the event was debounced (skipped).
   */
  enqueue(params: {
    entity: string;
    project: string;
    language: string;
    branch: string;
    isWrite: boolean;
  }): boolean {
    if (this.disposed) return false;

    const now = Date.now();

    // Debounce: skip if same file within window (unless write)
    if (!params.isWrite) {
      const lastTime = this.lastHeartbeats.get(params.entity);
      if (lastTime && now - lastTime < this.debounceMs) return false;
    }

    this.lastHeartbeats.set(params.entity, now);

    const heartbeat: HeartbeatPayload = {
      source: 'editor',
      entity: params.entity,
      entity_type: 'file',
      project: params.project,
      language: params.language,
      editor: this.config.editorName,
      machine_id: this.config.getMachineId(),
      branch: params.branch,
      is_write: params.isWrite,
      time: new Date().toISOString(),
    };

    this.queue.push(heartbeat);
    this.trimQueue();
    return true;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    const apiUrl = this.config.getApiUrl();
    const secret = this.config.getSecret();

    const success = await postHeartbeats(apiUrl, batch, secret);
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
      this.queue.unshift(...batch);
      this.trimQueue();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flush().catch(() => {});
  }

  private scheduleFlush(): void {
    const interval = this.consecutiveFailures >= this.maxConsecutiveFailures
      ? this.backoffIntervalMs
      : this.flushIntervalMs;

    this.flushTimer = setTimeout(async () => {
      if (this.disposed) return;
      await this.flush();
      this.scheduleFlush();
    }, interval);
  }

  private trimQueue(): void {
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }
  }
}
