import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 talks to Postgres through the pg driver adapter. It connects
 * lazily on the first query, so a database outage doesn't stop the app from
 * starting: /healthz stays up and /readyz reports it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
