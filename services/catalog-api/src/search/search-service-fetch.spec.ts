import type { RequestListener } from 'node:http';
import { startTestServer, type TestServer } from '../../test/http-test-server';
import { SearchUnavailableError } from './search.ports';
import { callSearchService, SearchServiceError } from './search-service-fetch';

describe('callSearchService', () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const start = async (handler: RequestListener) => {
    server = await startTestServer(handler);
    return server.url;
  };

  it('returns the parsed JSON body on 200', async () => {
    const url = await start((_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"a":1}');
    });
    await expect(
      callSearchService('GET', `${url}/x`, undefined, 1000),
    ).resolves.toEqual({
      a: 1,
    });
  });

  it('returns undefined on 204', async () => {
    const url = await start((_, res) => res.writeHead(204).end());
    await expect(
      callSearchService('DELETE', `${url}/products/1`, undefined, 1000),
    ).resolves.toBeUndefined();
  });

  it('sends a JSON body with a JSON content type', async () => {
    let received: { method?: string; type?: string; body: string } = {
      body: '',
    };
    const url = await start((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received = {
          method: req.method,
          type: req.headers['content-type'],
          body,
        };
        res.writeHead(200).end('{}');
      });
    });
    await callSearchService(
      'PUT',
      `${url}/products/1`,
      { id: '1', name: 'Phone' },
      1000,
    );
    expect(received.method).toBe('PUT');
    expect(received.type).toBe('application/json');
    expect(JSON.parse(received.body)).toEqual({ id: '1', name: 'Phone' });
  });

  it.each([500, 503])('maps %d to SearchUnavailableError', async (status) => {
    const url = await start((_, res) =>
      res.writeHead(status).end('{"error":"down"}'),
    );
    const err = await callSearchService(
      'GET',
      `${url}/search`,
      undefined,
      1000,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SearchUnavailableError);
    expect((err as Error).message).toContain(String(status));
  });

  it('maps another non-2xx to SearchServiceError with the status and message', async () => {
    const url = await start((_, res) =>
      res.writeHead(400).end('{"error":"bad q"}'),
    );
    const err = await callSearchService(
      'GET',
      `${url}/search`,
      undefined,
      1000,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SearchServiceError);
    expect((err as SearchServiceError).status).toBe(400);
    expect((err as Error).message).toContain('bad q');
  });

  it('maps a refused connection to SearchUnavailableError', async () => {
    const closed = await startTestServer(() => {});
    await closed.close();
    const { url } = closed;
    await expect(
      callSearchService('GET', `${url}/search`, undefined, 1000),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('maps a server that never answers to SearchUnavailableError within the timeout', async () => {
    const url = await start(() => {});
    const started = Date.now();
    await expect(
      callSearchService('GET', `${url}/search`, undefined, 50),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('times out a body that stalls after the headers', async () => {
    const url = await start((_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"hits":[');
    });
    const started = Date.now();
    await expect(
      callSearchService('GET', `${url}/search`, undefined, 50),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
