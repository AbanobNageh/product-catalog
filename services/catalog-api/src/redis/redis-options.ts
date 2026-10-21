import type { RedisClientOptions } from 'redis';

/**
 * node-redis options that keep a Redis problem from slowing requests down:
 * - disableOfflineQueue: while disconnected, commands fail at once instead of
 *   queueing until Redis comes back.
 * - connectTimeout: connecting gives up after 2s.
 *
 * Not used: commandOptions.timeout. It sounds like the fix for an unresponsive
 * Redis, but node-redis removes it once a command is written to the socket,
 * so it never bounds the wait for a reply. RedisCache applies its own timeout.
 */
export function redisClientOptions(url: string) {
  return {
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000 },
  } satisfies RedisClientOptions;
}
