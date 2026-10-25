import { loadConfig } from './app-config';

const keys = {
  READ_API_KEY: 'dev-read-key-not-secret-0000000000000000',
  WRITE_API_KEY: 'dev-write-key-not-secret-000000000000000',
  ADMIN_API_KEY: 'dev-admin-key-not-secret-000000000000000',
};

const required = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://y',
  SEARCH_SERVICE_URL: 'http://search:8080',
  ...keys,
};

const apiKeys = {
  read: keys.READ_API_KEY,
  write: keys.WRITE_API_KEY,
  admin: keys.ADMIN_API_KEY,
};

/** loadConfig's error message, or '' when it doesn't throw. */
const errorOf = (env: NodeJS.ProcessEnv): string => {
  try {
    loadConfig(env);
    return '';
  } catch (err) {
    return (err as Error).message;
  }
};

describe('loadConfig', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadConfig(required)).toEqual({
      port: 3000,
      databaseUrl: 'postgres://x',
      redisUrl: 'redis://y',
      searchServiceUrl: 'http://search:8080',
      logLevel: 'log',
      apiKeys,
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
      apiKeys,
    });
  });

  it('lists every missing variable in one error', () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*SEARCH_SERVICE_URL/,
    );
  });

  it('lists every missing API key in one error', () => {
    const rest = {
      ...required,
      READ_API_KEY: undefined,
      WRITE_API_KEY: undefined,
      ADMIN_API_KEY: undefined,
    };
    expect(() => loadConfig(rest)).toThrow(
      /READ_API_KEY is required[\s\S]*WRITE_API_KEY is required[\s\S]*ADMIN_API_KEY is required/,
    );
  });

  // ADR-0020: errors name the variable, never its value.
  it('rejects a key shorter than 32 characters without printing it', () => {
    const short = 'x'.repeat(31);
    const message = errorOf({ ...required, READ_API_KEY: short });
    expect(message).toContain('READ_API_KEY must be at least 32 characters');
    expect(message).not.toContain(short);
  });

  it('rejects two equal keys without printing them', () => {
    const message = errorOf({ ...required, ADMIN_API_KEY: keys.WRITE_API_KEY });
    expect(message).toContain(
      'WRITE_API_KEY and ADMIN_API_KEY must be different',
    );
    expect(message).not.toContain(keys.WRITE_API_KEY);
  });

  // Review: a key with a newline (kubectl --from-file, Set-Content) or a
  // non-ASCII character loaded fine, then matched nothing: every request 401.
  it.each([
    ['a trailing newline', 'k'.repeat(40) + '\n'],
    ['a space', 'k'.repeat(20) + ' ' + 'k'.repeat(20)],
    ['a non-ASCII character', 'k'.repeat(40) + 'é'],
  ])('rejects a key with %s without printing it', (_, key) => {
    const message = errorOf({ ...required, WRITE_API_KEY: key });
    expect(message).toContain(
      'WRITE_API_KEY must be printable ASCII without spaces',
    );
    expect(message).not.toContain('k'.repeat(20));
  });

  it('accepts a key of exactly 32 characters', () => {
    expect(
      loadConfig({ ...required, READ_API_KEY: 'r'.repeat(32) }).apiKeys.read,
    ).toBe('r'.repeat(32));
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
