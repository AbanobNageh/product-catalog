import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisCache } from '../redis/redis-cache';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let queryRaw: jest.Mock;
  let ping: jest.Mock;
  let controller: HealthController;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    ping = jest.fn().mockResolvedValue(undefined);
    controller = new HealthController(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { ping } as unknown as RedisCache,
    );
  });

  it('healthz reports ok and the package.json version without checking dependencies', () => {
    expect(controller.healthz()).toEqual({
      status: 'ok',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it('readyz is ok when Postgres and Redis respond', async () => {
    await expect(controller.readyz()).resolves.toEqual({
      status: 'ok',
      checks: { postgres: 'ok', redis: 'ok' },
    });
  });

  it('readyz is 503 and names the failing check', async () => {
    ping.mockRejectedValue(new Error('down'));
    const error = await controller.readyz().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      checks: { postgres: 'ok', redis: 'error' },
    });
  });

  it('readyz treats a check that hangs for 2s as failed', async () => {
    jest.useFakeTimers();
    try {
      queryRaw.mockReturnValue(new Promise(() => {}));
      const result = controller.readyz().catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(2000);
      const error = await result;
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'error',
        checks: { postgres: 'error', redis: 'ok' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
