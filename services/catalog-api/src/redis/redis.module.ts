import { Global, Logger, Module } from '@nestjs/common';
import { createClient } from 'redis';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { type CacheClient, REDIS_CLIENT, RedisCache } from './redis-cache';
import { redisClientOptions } from './redis-options';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): CacheClient => {
        const client = createClient(redisClientOptions(config.redisUrl));
        // node-redis emits 'error' on every failed reconnect attempt. Without
        // a listener, Node treats it as an unhandled error and crashes.
        const logger = new Logger('Redis');
        client.on('error', (err: unknown) => {
          logger.warn('Redis client error', { err: String(err) });
        });
        return client;
      },
    },
    RedisCache,
  ],
  exports: [RedisCache],
})
export class RedisModule {}
