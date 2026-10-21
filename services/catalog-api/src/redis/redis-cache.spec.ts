import { Logger } from '@nestjs/common';
import { type CacheClient, RedisCache } from './redis-cache';

function fakeClient(): jest.Mocked<CacheClient> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    ping: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
  };
}

const down = () => Promise.reject(new Error('connection refused'));

describe('RedisCache', () => {
  let client: jest.Mocked<CacheClient>;
  let cache: RedisCache;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    client = fakeClient();
    cache = new RedisCache(client);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getJson', () => {
    it('returns the parsed value on a hit', async () => {
      client.get.mockResolvedValue('{"a":1}');
      await expect(cache.getJson('k')).resolves.toEqual({ a: 1 });
      expect(client.get).toHaveBeenCalledWith('k');
    });

    it('returns undefined on a miss', async () => {
      client.get.mockResolvedValue(null);
      await expect(cache.getJson('k')).resolves.toBeUndefined();
    });

    it('returns undefined and warns when Redis fails', async () => {
      client.get.mockImplementation(down);
      await expect(cache.getJson('k')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('setJson', () => {
    it('stores JSON with a TTL in seconds', async () => {
      client.set.mockResolvedValue('OK');
      await cache.setJson('k', { a: 1 }, 300);
      expect(client.set).toHaveBeenCalledWith('k', '{"a":1}', { EX: 300 });
    });

    it('resolves and warns when Redis fails', async () => {
      client.set.mockImplementation(down);
      await expect(cache.setJson('k', 1, 60)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('deletes the key', async () => {
      client.del.mockResolvedValue(1);
      await cache.del('k');
      expect(client.del).toHaveBeenCalledWith('k');
    });

    it('resolves and warns when Redis fails', async () => {
      client.del.mockImplementation(down);
      await expect(cache.del('k')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('getCounter', () => {
    it('treats a missing key as 0', async () => {
      client.get.mockResolvedValue(null);
      await expect(cache.getCounter('c')).resolves.toBe(0);
    });

    it('parses the stored number', async () => {
      client.get.mockResolvedValue('7');
      await expect(cache.getCounter('c')).resolves.toBe(7);
    });

    it('returns undefined when Redis fails', async () => {
      client.get.mockImplementation(down);
      await expect(cache.getCounter('c')).resolves.toBeUndefined();
    });
  });

  describe('incr', () => {
    it('increments the key', async () => {
      client.incr.mockResolvedValue(8);
      await cache.incr('c');
      expect(client.incr).toHaveBeenCalledWith('c');
    });

    it('resolves and warns when Redis fails', async () => {
      client.incr.mockImplementation(down);
      await expect(cache.incr('c')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  // A connected but unresponsive Redis (paused, packet loss) never answers, and
  // node-redis drops its own command timeout once a command is written to the
  // socket. Measured live: a GET hung 187s. Each call must give up on its own.
  describe('when Redis never answers', () => {
    const never = () => new Promise<never>(() => {});

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    async function settlesWithin500ms<T>(call: Promise<T>): Promise<T> {
      let settled = false;
      const result = call.finally(() => (settled = true));
      await jest.advanceTimersByTimeAsync(499);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      return result;
    }

    it('getJson gives up after 500ms as a miss', async () => {
      client.get.mockImplementation(never);
      await expect(settlesWithin500ms(cache.getJson('k'))).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it('getCounter gives up after 500ms as unknown', async () => {
      client.get.mockImplementation(never);
      await expect(settlesWithin500ms(cache.getCounter('c'))).resolves.toBeUndefined();
    });

    it('setJson, del and incr give up after 500ms', async () => {
      client.set.mockImplementation(never);
      client.del.mockImplementation(never);
      client.incr.mockImplementation(never);
      await expect(settlesWithin500ms(cache.setJson('k', 1, 60))).resolves.toBeUndefined();
      await expect(settlesWithin500ms(cache.del('k'))).resolves.toBeUndefined();
      await expect(settlesWithin500ms(cache.incr('c'))).resolves.toBeUndefined();
    });
  });

  describe('ping', () => {
    it('throws when Redis is unreachable', async () => {
      client.ping.mockImplementation(down);
      await expect(cache.ping()).rejects.toThrow('connection refused');
    });
  });
});
