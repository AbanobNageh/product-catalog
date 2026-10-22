import type { ServerResponse } from 'node:http';
import {
  readBody,
  startTestServer,
  type TestServer,
} from '../../test/http-test-server';
import type { ProductResponse } from '../products/dto/product.response';
import {
  HttpSearchClient,
  HttpSearchIndexer,
  toSearchParams,
} from './http-search';
import {
  type BulkIndexResult,
  type SearchQuery,
  type SearchResult,
  SearchUnavailableError,
} from './search.ports';

const product = (id: string): ProductResponse => ({
  id,
  sku: `SKU-${id}`,
  name: 'Phone',
  description: 'A phone',
  category: 'electronics',
  brand: 'Acme',
  priceCents: 1999900,
  currency: 'EGP',
  stock: 3,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
});

interface Recorded {
  method: string;
  url: string;
  body: string;
}

describe('HTTP search adapters', () => {
  let server: TestServer;
  let calls: Recorded[];
  /** What the server answers; tests replace it. */
  let reply: (res: ServerResponse) => void;

  beforeEach(async () => {
    calls = [];
    reply = (res) => res.writeHead(200).end('{}');
    server = await startTestServer((req, res) => {
      void readBody(req).then((body) => {
        calls.push({ method: req.method ?? '', url: req.url ?? '', body });
        reply(res);
      });
    });
  });
  afterEach(() => server.close());

  const json = (status: number, body: unknown) => (res: ServerResponse) =>
    res
      .writeHead(status, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));

  describe('HttpSearchIndexer', () => {
    it('upserts with PUT /products/:id and the whole product', async () => {
      reply = json(200, { result: 'indexed' });
      await new HttpSearchIndexer(server.url).upsert(product('p1'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ method: 'PUT', url: '/products/p1' });
      expect(JSON.parse(calls[0].body)).toEqual(product('p1'));
    });

    it('removes with DELETE /products/:id', async () => {
      reply = (res) => res.writeHead(204).end();
      await expect(
        new HttpSearchIndexer(server.url).remove('p1'),
      ).resolves.toBeUndefined();
      expect(calls[0]).toMatchObject({ method: 'DELETE', url: '/products/p1' });
    });

    it('bulk-indexes with POST /products/_bulk and returns search-service result unchanged', async () => {
      const result: BulkIndexResult = {
        indexed: 1,
        skipped: 1,
        failed: [{ id: 'p2', status: 400, reason: 'bad' }],
      };
      reply = json(200, result);
      await expect(
        new HttpSearchIndexer(server.url).bulkUpsert([
          product('p1'),
          product('p2'),
        ]),
      ).resolves.toEqual(result);
      expect(calls[0]).toMatchObject({
        method: 'POST',
        url: '/products/_bulk',
      });
      expect(JSON.parse(calls[0].body)).toEqual({
        products: [product('p1'), product('p2')],
      });
    });

    it('gives bulk calls the longer timeout', async () => {
      reply = (res) =>
        setTimeout(
          () => json(200, { indexed: 0, skipped: 0, failed: [] })(res),
          100,
        );
      const indexer = new HttpSearchIndexer(server.url, {
        requestMs: 50,
        bulkMs: 1000,
      });
      await expect(indexer.bulkUpsert([product('p1')])).resolves.toMatchObject({
        indexed: 0,
      });
      await expect(indexer.upsert(product('p1'))).rejects.toBeInstanceOf(
        SearchUnavailableError,
      );
    });
  });

  describe('HttpSearchClient', () => {
    const query: SearchQuery = {
      q: 'phone',
      sort: 'relevance',
      page: 1,
      size: 20,
    };

    it('GETs /search and returns the result unchanged', async () => {
      const result: SearchResult = {
        hits: [product('p1')],
        total: 1,
        facets: {
          category: [{ key: 'electronics', count: 1 }],
          brand: [],
          price: [],
        },
      };
      reply = json(200, result);
      await expect(
        new HttpSearchClient(server.url).search(query),
      ).resolves.toEqual(result);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url.startsWith('/search?')).toBe(true);
    });

    // Review Focus 2: falsy values and special characters must arrive intact.
    it('sends 0, false and special characters exactly, and omits unset filters', async () => {
      reply = json(200, {
        hits: [],
        total: 0,
        facets: { category: [], brand: [], price: [] },
      });
      await new HttpSearchClient(server.url).search({
        q: 'phone & case #1 +é',
        minPrice: 0,
        inStock: false,
        sort: 'price_asc',
        page: 2,
        size: 10,
      });
      const params = new URL(calls[0].url, 'http://x').searchParams;
      expect(params.get('q')).toBe('phone & case #1 +é');
      expect(params.get('minPrice')).toBe('0');
      expect(params.get('inStock')).toBe('false');
      expect(params.get('sort')).toBe('price_asc');
      expect(params.get('page')).toBe('2');
      expect(params.get('size')).toBe('10');
      expect(params.has('maxPrice')).toBe(false);
      expect(params.has('category')).toBe(false);
      expect(params.has('brand')).toBe(false);
    });
  });

  it('toSearchParams leaves out undefined fields', () => {
    expect(
      toSearchParams({ sort: 'relevance', page: 1, size: 20 }).toString(),
    ).toBe('sort=relevance&page=1&size=20');
  });
});
