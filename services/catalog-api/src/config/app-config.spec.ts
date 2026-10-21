import { loadConfig } from './app-config';

const required = { DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://y' };

describe('loadConfig', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadConfig(required)).toEqual({
      port: 3000,
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://y',
      searchServiceUrl: undefined,
      logLevel: 'log',
    });
  });

  it('reads every variable when set', () => {
    expect(
      loadConfig({
        ...required,
        PORT: '8081',
        SEARCH_SERVICE_URL: 'http://search:8080',
        LOG_LEVEL: 'debug',
      }),
    ).toEqual({
      port: 8081,
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://y',
      searchServiceUrl: 'http://search:8080',
      logLevel: 'debug',
    });
  });

  it('lists every missing variable in one error', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ ...required, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});
