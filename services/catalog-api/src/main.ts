import { existsSync } from 'node:fs';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LOG_LEVELS, loadConfig } from './config/app-config';
import { configureApp } from './configure-app';

/** Hard limit for graceful shutdown (spec: exit within 10s of SIGTERM). */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap() {
  // Local development only: containers get real env vars and have no .env file.
  if (existsSync('.env')) process.loadEnvFile();

  // Fail fast, before Nest boots, if the environment is wrong.
  const config = loadConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      json: true,
      logLevels: LOG_LEVELS.slice(LOG_LEVELS.indexOf(config.logLevel)),
    }),
  });
  configureApp(app);

  // Nest closes the HTTP server (draining in-flight requests) and runs the
  // onModuleDestroy hooks that close Postgres and Redis. If that hangs,
  // exit anyway so the 10s promise holds.
  app.enableShutdownHooks();
  const logger = new Logger('Shutdown');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      logger.log('shutdown started: draining requests, closing connections', { signal });
      setTimeout(() => {
        logger.error('shutdown timed out, forcing exit', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
        // Pipe writes are async: exit once the error line is flushed, or it's lost.
        process.stderr.write('', () => process.exit(1));
      }, SHUTDOWN_TIMEOUT_MS).unref();
    });
  }

  await app.listen(config.port);
}

void bootstrap();
