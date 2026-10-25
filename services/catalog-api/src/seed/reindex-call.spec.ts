import { callReindex, readSeedEnv } from './reindex-call';

const KEY = 'dev-admin-key-not-secret-000000000000000';

const reply = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('readSeedEnv', () => {
  it('reads the database URL, the API URL and the key', () => {
    expect(
      readSeedEnv({
        DATABASE_URL: 'postgres://x',
        CATALOG_API_URL: 'http://api:3000/',
        CATALOG_API_KEY: KEY,
      }),
    ).toEqual({
      config: {
        databaseUrl: 'postgres://x',
        apiUrl: 'http://api:3000',
        apiKey: KEY,
      },
      errors: [],
    });
  });

  it('defaults the API URL to localhost:3000', () => {
    expect(
      readSeedEnv({ DATABASE_URL: 'postgres://x', CATALOG_API_KEY: KEY }).config
        ?.apiUrl,
    ).toBe('http://localhost:3000');
  });

  // Review Focus 3: checked before anything is inserted.
  it('requires CATALOG_API_KEY, saying it must be the admin key', () => {
    const { config, errors } = readSeedEnv({ DATABASE_URL: 'postgres://x' });
    expect(config).toBeUndefined();
    expect(errors).toEqual([
      'CATALOG_API_KEY is required: the admin API key (the seed calls POST /admin/reindex)',
    ]);
  });

  // Review: undici repeats an invalid header value in its error, so a key with
  // a control character would have reached the seed's log.
  it('rejects a CATALOG_API_KEY that is not printable ASCII, without printing it', () => {
    const { config, errors } = readSeedEnv({
      DATABASE_URL: 'postgres://x',
      CATALOG_API_KEY: `${KEY}\nX`,
    });
    expect(config).toBeUndefined();
    expect(errors).toEqual([
      'CATALOG_API_KEY must be printable ASCII without spaces',
    ]);
  });

  it('lists every missing variable', () => {
    expect(readSeedEnv({}).errors).toEqual([
      'DATABASE_URL is required',
      'CATALOG_API_KEY is required: the admin API key (the seed calls POST /admin/reindex)',
    ]);
  });
});

describe('callReindex', () => {
  const url = 'http://api:3000';

  it('sends the key as a bearer token and returns the result when it swapped', async () => {
    const result = { indexed: 10, skipped: 0, failed: [], swapped: true };
    const fetchFn = reply(200, result);
    await expect(callReindex(url, KEY, fetchFn)).resolves.toEqual({
      ok: true,
      result,
    });
    const [target, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('http://api:3000/admin/reindex');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(
      `Bearer ${KEY}`,
    );
  });

  it('explains a 401: the key is not valid', async () => {
    const out = await callReindex(
      url,
      KEY,
      reply(401, { statusCode: 401, message: 'a valid API key is required' }),
    );
    expect(out).toMatchObject({
      ok: false,
      error:
        'reindex refused (401): CATALOG_API_KEY is not a valid API key; the seed needs the admin key',
    });
  });

  it('explains a 403: the key has too low a scope', async () => {
    const out = await callReindex(
      url,
      KEY,
      reply(403, {
        statusCode: 403,
        message: 'this endpoint needs the admin scope; your key has read',
      }),
    );
    expect(out).toMatchObject({
      ok: false,
      error:
        'reindex refused (403): CATALOG_API_KEY is not the admin key; the seed needs the admin scope',
      details: {
        body: {
          message: 'this endpoint needs the admin scope; your key has read',
        },
      },
    });
  });

  it.each([
    [500, { message: 'boom' }, 'reindex failed (500)'],
    [
      200,
      { failed: [{ id: 'a' }], swapped: false },
      'reindex finished with failed items',
    ],
    [200, { failed: [], swapped: false }, 'reindex did not swap'],
  ])('fails on status %p with %p', async (status, body, error) => {
    await expect(
      callReindex(url, KEY, reply(status, body)),
    ).resolves.toMatchObject({ ok: false, error });
  });

  it('fails when catalog-api is unreachable', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(
        new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
      );
    await expect(callReindex(url, KEY, fetchFn)).resolves.toMatchObject({
      ok: false,
      error: 'reindex request failed',
      details: { cause: 'ECONNREFUSED' },
    });
  });

  // Review Focus 4: the key never reaches what the seed logs.
  it('never puts the key in an error or its details', async () => {
    const outs = await Promise.all([
      callReindex(url, KEY, reply(401, {})),
      callReindex(url, KEY, reply(403, {})),
      callReindex(url, KEY, reply(500, {})),
      callReindex(url, KEY, jest.fn().mockRejectedValue(new Error('x'))),
    ]);
    expect(JSON.stringify(outs)).not.toContain(KEY);
    expect(readSeedEnv({ CATALOG_API_KEY: KEY }).errors.join()).not.toContain(
      KEY,
    );
  });
});
