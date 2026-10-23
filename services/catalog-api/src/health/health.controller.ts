import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { APP_VERSION } from '../common/app-version';
import { withTimeout } from '../common/with-timeout';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCache } from '../redis/redis-cache';

/** Each dependency check gets the same 2s budget as service-to-service calls. */
const CHECK_TIMEOUT_MS = 2000;

type CheckStatus = 'ok' | 'error';

async function check(probe: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await withTimeout(probe(), CHECK_TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'error';
  }
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCache,
  ) {}

  /** Liveness: the process is up. Deliberately checks no dependencies. */
  @Get('healthz')
  @ApiOkResponse({ description: 'The process is up, and its version' })
  healthz() {
    return { status: 'ok', version: APP_VERSION };
  }

  /** Readiness: Postgres and Redis are reachable. */
  @Get('readyz')
  @ApiOkResponse({ description: 'Postgres and Redis are reachable' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unreachable' })
  async readyz() {
    const [postgres, redis] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.cache.ping()),
    ]);
    const checks = { postgres, redis };
    if (postgres === 'error' || redis === 'error') {
      throw new ServiceUnavailableException({ status: 'error', checks });
    }
    return { status: 'ok', checks };
  }
}
