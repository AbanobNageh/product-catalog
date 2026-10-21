import type { LogLevel } from '@nestjs/common';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Optional until search-service is wired up in milestone 1.4. */
  searchServiceUrl?: string;
  logLevel: LogLevel;
}

/** Lowest to highest severity, so a level enables itself and everything after it. */
export const LOG_LEVELS: readonly LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
];

/**
 * Builds the app config from environment variables. Collects every problem
 * before throwing, so a misconfigured deployment shows all of them at once.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const errors: string[] = [];

  const required = (name: string): string => {
    const value = env[name];
    if (!value) errors.push(`${name} is required`);
    return value ?? '';
  };

  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }

  const logLevel = (env.LOG_LEVEL ?? 'log') as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) {
    errors.push(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${env.LOG_LEVEL}"`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    port,
    databaseUrl,
    redisUrl,
    searchServiceUrl: env.SEARCH_SERVICE_URL || undefined,
    logLevel,
  };
}
