import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

/** Registers the API key guard for every route in the app (ADR-0020). */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AuthModule {}
