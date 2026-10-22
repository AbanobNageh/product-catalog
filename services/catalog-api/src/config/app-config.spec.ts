import { loadConfig } from './app-config';

const required = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://y',
  SEARCH_SERVICE_URL: 'http://search:8080',
};

describe('loadConfig', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadConfig(required)).toEqual({
      port: 3000,
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://y',
      searchServiceUrl: 'http://search:8080',
      logLevel: 'log',
    });
  });

  it('reads every variable when set', () => {
    expect(
      loadConfig({
        ...required,
        PORT: '8081',
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
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*SEARCH_SERVICE_URL/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ ...required, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it.each(['ftp://x', 'not a url', 'http://'])(
    'rejects SEARCH_SERVICE_URL %p',
    (url) => {
      expect(() =>
        loadConfig({ ...required, SEARCH_SERVICE_URL: url }),
      ).toThrow(/SEARCH_SERVICE_URL must be an http\(s\) URL/);
    },
  );

  it('strips trailing slashes from SEARCH_SERVICE_URL', () => {
    expect(
      loadConfig({
        ...required,
        SEARCH_SERVICE_URL: 'http://search-service:8080/',
      }).searchServiceUrl,
    ).toBe('http://search-service:8080');
  });
});
