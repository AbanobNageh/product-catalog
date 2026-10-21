import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, ProductsModule],
  controllers: [HealthController],
})
export class AppModule {}
