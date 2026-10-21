import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { withTimeout } from '../common/with-timeout';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** The slice of the node-redis client that the cache uses. */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  ping(): Promise<unknown>;
  connect(): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Each cache call gives up after this long. node-redis has a command timeout,
 * but it only covers time in the write queue: once a command is on the socket
 * the reply wait is unbounded, so a connected but unresponsive Redis would hang
 * requests (measured: 187s).
 */
export const CACHE_COMMAND_TIMEOUT_MS = 500;

/**
 * JSON cache helpers on Redis. The cache is an optimisation, so every method
 * except ping() logs a Redis failure or timeout and carries on; callers fall
 * back to Postgres. With disableOfflineQueue on the client, a disconnected
 * Redis fails at once; the per-call timeout covers an unresponsive one.
 */
@Injectable()
export class RedisCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: CacheClient) {}

  onModuleInit(): void {
    // Not awaited: the app starts (and /healthz answers) even if Redis is down.
    // The client keeps reconnecting in the background.
    this.client.connect().catch((err: unknown) => {
      this.logger.warn('Redis connect failed', { err: String(err) });
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // Already closed or never connected.
    }
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.bounded(this.client.get(key));
      this.logger.debug('cache lookup', { key, hit: raw !== null });
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (err) {
      this.warn('get', key, err);
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.bounded(
        this.client.set(key, JSON.stringify(value), { EX: ttlSeconds }),
      );
    } catch (err) {
      this.warn('set', key, err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.bounded(this.client.del(key));
    } catch (err) {
      this.warn('del', key, err);
    }
  }

  /** A missing counter is 0. Returns undefined if Redis can't be read. */
  async getCounter(key: string): Promise<number | undefined> {
    try {
      return Number((await this.bounded(this.client.get(key))) ?? 0);
    } catch (err) {
      this.warn('get', key, err);
      return undefined;
    }
  }

  async incr(key: string): Promise<void> {
    try {
      await this.bounded(this.client.incr(key));
    } catch (err) {
      this.warn('incr', key, err);
    }
  }

  /** For readiness: throws if Redis is unreachable. */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  private bounded<T>(command: Promise<T>): Promise<T> {
    return withTimeout(command, CACHE_COMMAND_TIMEOUT_MS);
  }

  private warn(op: string, key: string, err: unknown): void {
    this.logger.warn('Redis command failed, bypassing cache', {
      op,
      key,
      err: String(err),
    });
  }
}
