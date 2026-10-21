import { redisClientOptions } from './redis-options';

describe('redisClientOptions', () => {
  const options = redisClientOptions('redis://cache:6379/0');

  it('uses the configured URL', () => {
    expect(options.url).toBe('redis://cache:6379/0');
  });

  it('fails commands at once while disconnected (no offline queue)', () => {
    expect(options.disableOfflineQueue).toBe(true);
  });

  it('bounds connecting to 2s', () => {
    expect(options.socket).toMatchObject({ connectTimeout: 2000 });
  });
});
