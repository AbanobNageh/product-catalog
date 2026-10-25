import type { LogLevel } from '@nestjs/common';
import type { Scope } from '../auth/scope';
import { apiKeyProblem } from './api-key-format';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Base URL of search-service, without a trailing slash. */
  searchServiceUrl: string;
  logLevel: LogLevel;
  /** One key per scope (ADR-0020). Never log these. */
  apiKeys: Record<Scope, string>;
}

const API_KEY_VARS = {
  read: 'READ_API_KEY',
  write: 'WRITE_API_KEY',
  admin: 'ADMIN_API_KEY',
} as const satisfies Record<Scope, string>;

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
  const searchServiceUrl = required('SEARCH_SERVICE_URL').replace(/\/+$/, '');
  if (searchServiceUrl && !isHttpUrl(searchServiceUrl)) {
    errors.push(
      `SEARCH_SERVICE_URL must be an http(s) URL with a host, got "${env.SEARCH_SERVICE_URL}"`,
    );
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(
      `PORT must be an integer between 1 and 65535, got "${env.PORT}"`,
    );
  }

  const logLevel = (env.LOG_LEVEL ?? 'log') as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) {
    errors.push(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${env.LOG_LEVEL}"`,
    );
  }

  // Messages name the variable, never the value: a key must not reach a log.
  const apiKeys = {
    read: required(API_KEY_VARS.read),
    write: required(API_KEY_VARS.write),
    admin: required(API_KEY_VARS.admin),
  };
  const scopes = Object.keys(API_KEY_VARS) as Scope[];
  for (const scope of scopes) {
    const problem =
      apiKeys[scope] && apiKeyProblem(API_KEY_VARS[scope], apiKeys[scope]);
    if (problem) errors.push(problem);
  }
  scopes.forEach((a, i) => {
    for (const b of scopes.slice(i + 1)) {
      if (apiKeys[a] && apiKeys[a] === apiKeys[b]) {
        errors.push(
          `${API_KEY_VARS[a]} and ${API_KEY_VARS[b]} must be different`,
        );
      }
    }
  });

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    port,
    databaseUrl,
    redisUrl,
    searchServiceUrl,
    logLevel,
    apiKeys,
  };
}

function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol, host } = new URL(value);
  return (protocol === 'http:' || protocol === 'https:') && host !== '';
}
