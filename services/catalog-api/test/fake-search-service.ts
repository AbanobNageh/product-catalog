import { readBody, startTestServer } from './http-test-server';

/**
 * Stands in for search-service in the e2e test, so the test never writes
 * catalog_test products into the real dev index. Records every call. Set
 * `status` to anything but 200 to simulate an outage.
 *
 * Mirrors search-service's reindex contract (ADR-0007) with an in-memory
 * build: start → 201 {build}, or 409 while one runs; _bulk and finish with
 * any other name → 409; abort → 204 always; DELETE without version → 400.
 */
export interface FakeSearchService {
  url: string;
  calls: { method: string; path: string; body: unknown }[];
  status: number;
  /** The running build's name, or undefined when no reindex is running. */
  build: string | undefined;
  close(): Promise<void>;
}

export async function startFakeSearchService(): Promise<FakeSearchService> {
  const fake = {
    calls: [],
    status: 200,
    build: undefined,
  } as unknown as FakeSearchService;
  let builds = 1;

  const server = await startTestServer((req, res) => {
    void readBody(req).then((raw) => {
      const body: unknown = raw ? JSON.parse(raw) : undefined;
      const method = req.method ?? '';
      const path = req.url ?? '';
      fake.calls.push({ method, path, body });

      const send = (status: number, payload?: unknown) => {
        if (payload === undefined) return res.writeHead(status).end();
        res
          .writeHead(status, { 'content-type': 'application/json' })
          .end(JSON.stringify(payload));
      };

      if (fake.status !== 200) return send(fake.status, { error: 'fake down' });
      if (method === 'PUT') return send(200, { result: 'indexed' });
      if (method === 'DELETE') {
        const version = new URL(path, 'http://fake').searchParams.get(
          'version',
        );
        if (!version || !/^[1-9]\d*$/.test(version)) {
          return send(400, { error: 'version must be a positive integer' });
        }
        return send(204);
      }
      if (method === 'POST' && path === '/reindex/start') {
        if (fake.build) return send(409, { error: 'a reindex is running' });
        fake.build = `products-v${++builds}`;
        return send(201, { build: fake.build });
      }
      const build = (body as { build?: unknown } | undefined)?.build;
      if (method === 'POST' && path === '/reindex/_bulk') {
        if (!fake.build || build !== fake.build) {
          return send(409, { error: 'the build is gone' });
        }
        const { products } = body as { products: unknown[] };
        return send(200, { indexed: products.length, skipped: 0, failed: [] });
      }
      if (method === 'POST' && path === '/reindex/finish') {
        if (!fake.build || build !== fake.build) {
          return send(409, { error: 'the build is gone' });
        }
        fake.build = undefined;
        return send(204);
      }
      if (method === 'POST' && path === '/reindex/abort') {
        if (build === fake.build) fake.build = undefined;
        return send(204);
      }
      if (method === 'GET' && path.startsWith('/search')) {
        return send(200, {
          hits: [],
          total: 0,
          facets: { category: [], brand: [], price: [] },
        });
      }
      send(404, { error: `fake: no route for ${method} ${path}` });
    });
  });

  fake.url = server.url;
  fake.close = server.close;
  return fake;
}
