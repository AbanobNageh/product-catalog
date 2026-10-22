import { readBody, startTestServer } from './http-test-server';

/**
 * Stands in for search-service in the e2e test, so the test never writes
 * catalog_test products into the real dev index. Records every call. Set
 * `status` to anything but 200 to simulate an outage.
 */
export interface FakeSearchService {
  url: string;
  calls: { method: string; path: string; body: unknown }[];
  status: number;
  close(): Promise<void>;
}

export async function startFakeSearchService(): Promise<FakeSearchService> {
  const fake = { calls: [], status: 200 } as unknown as FakeSearchService;

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
      if (method === 'DELETE') return send(204);
      if (method === 'POST' && path === '/products/_bulk') {
        const { products } = body as { products: unknown[] };
        return send(200, { indexed: products.length, skipped: 0, failed: [] });
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
