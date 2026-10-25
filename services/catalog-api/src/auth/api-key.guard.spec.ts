import {
  type ExecutionContext,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '../config/app-config';
import { ApiKeyGuard } from './api-key.guard';
import { Public, RequireScope } from './auth.decorators';

const KEYS = {
  read: 'dev-read-key-not-secret-0000000000000000',
  write: 'dev-write-key-not-secret-000000000000000',
  admin: 'dev-admin-key-not-secret-000000000000000',
};

class Routes {
  @RequireScope('read') read() {}
  @RequireScope('write') write() {}
  @RequireScope('admin') admin() {}
  @Public() open() {}
  forgotten() {}
}

@Public()
class OpenRoutes {
  health() {}
}

type Handler = keyof Routes | 'health';

const context = (handler: Handler, authorization?: string) => {
  const setHeader = jest.fn();
  const cls = handler === 'health' ? OpenRoutes : Routes;
  const ctx = {
    getHandler: () =>
      (cls.prototype as unknown as Record<string, unknown>)[handler],
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        path: '/x',
        headers: authorization === undefined ? {} : { authorization },
      }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
};

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let logs: Record<'error' | 'warn' | 'debug' | 'log', jest.SpyInstance>;

  beforeEach(() => {
    guard = new ApiKeyGuard(new Reflector(), { apiKeys: KEYS } as AppConfig);
    logs = {
      error: jest.spyOn(Logger.prototype, 'error').mockImplementation(),
      warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
      debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(),
      log: jest.spyOn(Logger.prototype, 'log').mockImplementation(),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  const run = (handler: Handler, authorization?: string) => {
    const { ctx, setHeader } = context(handler, authorization);
    try {
      return { result: guard.canActivate(ctx), setHeader };
    } catch (error) {
      return { error, setHeader };
    }
  };

  it('lets @Public() routes through without a key, on the method or the class', () => {
    expect(run('open').result).toBe(true);
    expect(run('health').result).toBe(true);
  });

  it.each([
    ['read', 'read'],
    ['write', 'read'],
    ['write', 'write'],
    ['admin', 'read'],
    ['admin', 'write'],
    ['admin', 'admin'],
  ] as const)('lets a %s key call a %s endpoint', (has, needs) => {
    expect(run(needs, `Bearer ${KEYS[has]}`).result).toBe(true);
  });

  it.each([
    ['read', 'write'],
    ['read', 'admin'],
    ['write', 'admin'],
  ] as const)(
    'refuses a %s key on a %s endpoint with 403 naming both',
    (has, needs) => {
      const { error } = run(needs, `Bearer ${KEYS[has]}`);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe(
        `this endpoint needs the ${needs} scope; your key has ${has}`,
      );
    },
  );

  it('accepts the scheme in any case', () => {
    expect(run('read', `bearer ${KEYS.read}`).result).toBe(true);
    expect(run('read', `BEARER ${KEYS.read}`).result).toBe(true);
  });

  // Review Focus 2: every malformed header is a 401, never a 500.
  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['the scheme alone', 'Bearer'],
    ['two spaces', `Bearer  ${KEYS.read}`],
    ['a trailing space', `Bearer ${KEYS.read} `],
    ['another scheme', `Basic ${KEYS.read}`],
    ['no scheme', KEYS.read],
    ['an unknown key', 'Bearer not-a-key-at-all-but-long-enough-000000'],
    ['the read key plus a character', `Bearer ${KEYS.read}x`],
    ['a prefix of the read key', `Bearer ${KEYS.read.slice(0, 10)}`],
  ])('answers %s with 401 and WWW-Authenticate: Bearer', (_, header) => {
    const { error, setHeader } = run('read', header);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      statusCode: 401,
      message: 'a valid API key is required: Authorization: Bearer <key>',
      error: 'Unauthorized',
    });
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
  });

  it('refuses a route with neither a scope nor @Public(), and logs an error', () => {
    const { error } = run('forgotten', `Bearer ${KEYS.admin}`);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(logs.error).toHaveBeenCalled();
  });

  // Review Focus 4: a key must never reach a log.
  it('never logs a key', () => {
    run('read', `Bearer ${KEYS.read}`);
    run('admin', `Bearer ${KEYS.write}`);
    run('read', `Bearer ${KEYS.admin}x`);
    run('forgotten', `Bearer ${KEYS.admin}`);
    const logged = JSON.stringify(
      Object.values(logs).flatMap((spy) => spy.mock.calls),
    );
    expect(logs.warn).toHaveBeenCalled();
    expect(logs.debug).toHaveBeenCalled();
    for (const key of Object.values(KEYS)) expect(logged).not.toContain(key);
  });
});
