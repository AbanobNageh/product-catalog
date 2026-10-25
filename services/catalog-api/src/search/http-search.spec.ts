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
  HttpSearchReindexer,
  toSearchParams,
} from './http-search';
import { SearchServiceError } from './search-service-fetch';
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
  version: 1,
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

    it('removes with DELETE /products/:id?version=', async () => {
      reply = (res) => res.writeHead(204).end();
      await expect(
        new HttpSearchIndexer(server.url).remove('p1', 1792576800124),
      ).resolves.toBeUndefined();
      expect(calls[0]).toMatchObject({
        method: 'DELETE',
        url: '/products/p1?version=1792576800124',
      });
    });

    it('gives single writes the short timeout', async () => {
      reply = (res) => setTimeout(() => json(200, {})(res), 100);
      const indexer = new HttpSearchIndexer(server.url, {
        requestMs: 50,
        bulkMs: 1000,
      });
      await expect(indexer.upsert(product('p1'))).rejects.toBeInstanceOf(
        SearchUnavailableError,
      );
    });
  });

  describe('HttpSearchReindexer', () => {
    const result: BulkIndexResult = {
      indexed: 1,
      skipped: 1,
      failed: [{ id: 'p2', status: 400, reason: 'bad' }],
    };

    it('start POSTs /reindex/start and returns the build name', async () => {
      reply = json(201, { build: 'products-v2' });
      await expect(new HttpSearchReindexer(server.url).start()).resolves.toBe(
        'products-v2',
      );
      expect(calls[0]).toMatchObject({
        method: 'POST',
        url: '/reindex/start',
      });
    });

    it('start throws on an empty 201 body', async () => {
      reply = (res) => res.writeHead(201).end();
      await expect(new HttpSearchReindexer(server.url).start()).rejects.toThrow(
        'empty reindex start response',
      );
    });

    it('bulk POSTs {build, products} to /reindex/_bulk and returns the result', async () => {
      reply = json(200, result);
      await expect(
        new HttpSearchReindexer(server.url).bulk('products-v2', [
          product('p1'),
          product('p2'),
        ]),
      ).resolves.toEqual(result);
      expect(calls[0]).toMatchObject({
        method: 'POST',
        url: '/reindex/_bulk',
      });
      expect(JSON.parse(calls[0].body)).toEqual({
        build: 'products-v2',
        products: [product('p1'), product('p2')],
      });
    });

    it('bulk throws on an empty 200 body', async () => {
      reply = (res) => res.writeHead(200).end();
      await expect(
        new HttpSearchReindexer(server.url).bulk('products-v2', []),
      ).rejects.toThrow('empty bulk response');
    });

    it('finish and abort POST {build}', async () => {
      reply = (res) => res.writeHead(204).end();
      const reindexer = new HttpSearchReindexer(server.url);
      await reindexer.finish('products-v2');
      await reindexer.abort('products-v2');
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        ['POST', '/reindex/finish'],
        ['POST', '/reindex/abort'],
      ]);
      expect(JSON.parse(calls[0].body)).toEqual({ build: 'products-v2' });
      expect(JSON.parse(calls[1].body)).toEqual({ build: 'products-v2' });
    });

    it('surfaces a 409 from finish as SearchServiceError(409)', async () => {
      reply = json(409, { error: 'build gone' });
      const err: unknown = await new HttpSearchReindexer(server.url)
        .finish('products-v2')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SearchServiceError);
      expect((err as SearchServiceError).status).toBe(409);
    });

    it('uses the longer timeout for every reindex call', async () => {
      reply = (res) => setTimeout(() => json(200, result)(res), 100);
      const reindexer = new HttpSearchReindexer(server.url, {
        requestMs: 50,
        bulkMs: 1000,
      });
      await expect(reindexer.bulk('b', [])).resolves.toEqual(result);
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
        maxStock: 0,
        sort: 'stock_asc',
        page: 2,
        size: 10,
      });
      const params = new URL(calls[0].url, 'http://x').searchParams;
      expect(params.get('q')).toBe('phone & case #1 +é');
      expect(params.get('minPrice')).toBe('0');
      expect(params.get('inStock')).toBe('false');
      expect(params.get('maxStock')).toBe('0');
      expect(params.get('sort')).toBe('stock_asc');
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
