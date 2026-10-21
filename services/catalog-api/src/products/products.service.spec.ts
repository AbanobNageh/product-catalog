import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type Product } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisCache } from '../redis/redis-cache';
import { searchCacheKey } from '../search/search-cache-key';
import {
  SEARCH_VERSION_KEY,
  type SearchClient,
  type SearchIndexer,
  type SearchQuery,
  type SearchResult,
  SearchUnavailableError,
} from '../search/search.ports';
import { toProductResponse } from './dto/product.response';
import { ProductsService } from './products.service';

const ID = '0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01';

const product: Product = {
  id: ID,
  sku: 'SKU-1',
  name: 'Phone',
  description: 'A phone',
  category: 'electronics',
  brand: 'Acme',
  priceCents: 1999900,
  currency: 'EGP',
  stock: 3,
  createdAt: new Date('2026-10-21T10:00:00.000Z'),
  updatedAt: new Date('2026-10-21T10:00:00.000Z'),
};

const createBody = {
  sku: 'SKU-1',
  name: 'Phone',
  description: 'A phone',
  category: 'electronics',
  brand: 'Acme',
  priceCents: 1999900,
  stock: 3,
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
    code,
    clientVersion: '7.10.1',
  });

describe('ProductsService', () => {
  let db: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let cache: {
    getJson: jest.Mock;
    setJson: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    getCounter: jest.Mock;
  };
  let indexer: jest.Mocked<SearchIndexer>;
  let searchClient: jest.Mocked<SearchClient>;
  let logError: jest.SpyInstance;
  let service: ProductsService;

  beforeEach(() => {
    db = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    cache = {
      getJson: jest.fn().mockResolvedValue(undefined),
      setJson: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(undefined),
      getCounter: jest.fn().mockResolvedValue(0),
    };
    indexer = {
      upsert: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      bulkUpsert: jest.fn().mockResolvedValue(undefined),
    };
    searchClient = { search: jest.fn() };
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    service = new ProductsService(
      { product: db } as unknown as PrismaService,
      cache as unknown as RedisCache,
      indexer,
      searchClient,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findOne', () => {
    it('serves a cache hit without touching Postgres', async () => {
      const cached = toProductResponse(product);
      cache.getJson.mockResolvedValue(cached);
      await expect(service.findOne(ID)).resolves.toEqual(cached);
      expect(cache.getJson).toHaveBeenCalledWith(`product:${ID}`);
      expect(db.findUnique).not.toHaveBeenCalled();
    });

    it('reads Postgres on a miss and caches for 300s', async () => {
      db.findUnique.mockResolvedValue(product);
      await expect(service.findOne(ID)).resolves.toEqual(
        toProductResponse(product),
      );
      expect(db.findUnique).toHaveBeenCalledWith({ where: { id: ID } });
      expect(cache.setJson).toHaveBeenCalledWith(
        `product:${ID}`,
        toProductResponse(product),
        300,
      );
    });

    it('throws NotFound for an unknown id and caches nothing', async () => {
      db.findUnique.mockResolvedValue(null);
      await expect(service.findOne(ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cache.setJson).not.toHaveBeenCalled();
    });

    it('still answers from Postgres when Redis is down', async () => {
      // RedisCache turns Redis failures into misses; see redis-cache.spec.ts.
      cache.getJson.mockResolvedValue(undefined);
      db.findUnique.mockResolvedValue(product);
      await expect(service.findOne(ID)).resolves.toEqual(
        toProductResponse(product),
      );
    });
  });

  describe('list', () => {
    it('pages newest first and returns the total', async () => {
      db.findMany.mockResolvedValue([product]);
      db.count.mockResolvedValue(41);
      await expect(service.list({ page: 3, limit: 20 })).resolves.toEqual({
        items: [toProductResponse(product)],
        total: 41,
        page: 3,
        limit: 20,
      });
      expect(db.findMany).toHaveBeenCalledWith({
        skip: 40,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      expect(cache.getJson).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('indexes the new product, then bumps the search version', async () => {
      db.create.mockResolvedValue(product);
      await expect(service.create(createBody)).resolves.toEqual(
        toProductResponse(product),
      );
      expect(db.create).toHaveBeenCalledWith({ data: createBody });
      expect(indexer.upsert).toHaveBeenCalledWith(toProductResponse(product));
      expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
      expect(indexer.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        cache.incr.mock.invocationCallOrder[0],
      );
    });

    it('succeeds and logs when the index call fails', async () => {
      db.create.mockResolvedValue(product);
      indexer.upsert.mockRejectedValue(new Error('search-service down'));
      await expect(service.create(createBody)).resolves.toEqual(
        toProductResponse(product),
      );
      expect(logError).toHaveBeenCalled();
      expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
    });

    it('maps a duplicate sku to Conflict and has no side effects', async () => {
      db.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.create(createBody)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(indexer.upsert).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('rethrows unexpected database errors', async () => {
      db.create.mockRejectedValue(new Error('connection lost'));
      await expect(service.create(createBody)).rejects.toThrow('connection lost');
    });
  });

  describe('update', () => {
    it('invalidates the cache, re-indexes, then bumps the search version', async () => {
      const updated = { ...product, priceCents: 1 };
      db.update.mockResolvedValue(updated);
      await expect(service.update(ID, { priceCents: 1 })).resolves.toEqual(
        toProductResponse(updated),
      );
      expect(db.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { priceCents: 1 },
      });
      expect(cache.del).toHaveBeenCalledWith(`product:${ID}`);
      expect(indexer.upsert).toHaveBeenCalledWith(toProductResponse(updated));
      const [del] = cache.del.mock.invocationCallOrder;
      const [upsert] = indexer.upsert.mock.invocationCallOrder;
      const [incr] = cache.incr.mock.invocationCallOrder;
      expect(del).toBeLessThan(upsert);
      expect(upsert).toBeLessThan(incr);
    });

    it('rejects an empty body', async () => {
      await expect(service.update(ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it('maps an unknown id to NotFound', async () => {
      db.update.mockRejectedValue(prismaError('P2025'));
      await expect(service.update(ID, { stock: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('maps a duplicate sku to Conflict', async () => {
      db.update.mockRejectedValue(prismaError('P2002'));
      await expect(service.update(ID, { sku: 'TAKEN' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes, invalidates, removes from the index, then bumps the version', async () => {
      db.delete.mockResolvedValue(product);
      await expect(service.remove(ID)).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalledWith({ where: { id: ID } });
      expect(cache.del).toHaveBeenCalledWith(`product:${ID}`);
      expect(indexer.remove).toHaveBeenCalledWith(ID);
      expect(indexer.remove.mock.invocationCallOrder[0]).toBeLessThan(
        cache.incr.mock.invocationCallOrder[0],
      );
    });

    it('maps an unknown id to NotFound and has no side effects', async () => {
      db.delete.mockRejectedValue(prismaError('P2025'));
      await expect(service.remove(ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(indexer.remove).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('succeeds and logs when the index call fails', async () => {
      db.delete.mockResolvedValue(product);
      indexer.remove.mockRejectedValue(new Error('search-service down'));
      await expect(service.remove(ID)).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const query: SearchQuery = { q: 'phone', sort: 'relevance', page: 1, size: 20 };
    const result: SearchResult = {
      hits: [toProductResponse(product)],
      total: 1,
      facets: { category: [], brand: [], price: [] },
    };

    it('serves a cache hit for the current version without calling search-service', async () => {
      cache.getCounter.mockResolvedValue(4);
      cache.getJson.mockResolvedValue(result);
      await expect(service.search(query)).resolves.toEqual(result);
      expect(cache.getCounter).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
      expect(cache.getJson).toHaveBeenCalledWith(searchCacheKey(query, 4));
      expect(searchClient.search).not.toHaveBeenCalled();
    });

    it('calls search-service on a miss and caches for 60s', async () => {
      cache.getCounter.mockResolvedValue(4);
      searchClient.search.mockResolvedValue(result);
      await expect(service.search(query)).resolves.toEqual(result);
      expect(searchClient.search).toHaveBeenCalledWith(query);
      expect(cache.setJson).toHaveBeenCalledWith(
        searchCacheKey(query, 4),
        result,
        60,
      );
    });

    it('returns 503 when search-service is unavailable, and caches nothing', async () => {
      searchClient.search.mockRejectedValue(
        new SearchUnavailableError('search-service is not configured'),
      );
      await expect(service.search(query)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cache.setJson).not.toHaveBeenCalled();
    });

    it('skips the cache entirely when the version cannot be read', async () => {
      cache.getCounter.mockResolvedValue(undefined);
      searchClient.search.mockResolvedValue(result);
      await expect(service.search(query)).resolves.toEqual(result);
      expect(cache.getJson).not.toHaveBeenCalled();
      expect(cache.setJson).not.toHaveBeenCalled();
    });
  });

  describe('reindex', () => {
    const rows = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...product,
        id: `id-${String(from + i).padStart(5, '0')}`,
        sku: `SKU-${from + i}`,
      }));

    it('sends Postgres to the indexer in batches of 500, then bumps the version once', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(500, 500))
        .mockResolvedValueOnce(rows(201, 1000));
      await expect(service.reindex()).resolves.toEqual({ indexed: 1201 });
      expect(indexer.bulkUpsert).toHaveBeenCalledTimes(3);
      expect(indexer.bulkUpsert.mock.calls.map(([b]) => b.length)).toEqual([
        500, 500, 201,
      ]);
      // Keyset pagination: each batch starts after the last id of the previous one.
      expect(db.findMany.mock.calls[1][0]).toMatchObject({
        where: { id: { gt: 'id-00499' } },
        orderBy: { id: 'asc' },
        take: 500,
      });
      expect(cache.incr).toHaveBeenCalledTimes(1);
      expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
    });

    it('handles an empty table', async () => {
      db.findMany.mockResolvedValueOnce([]);
      await expect(service.reindex()).resolves.toEqual({ indexed: 0 });
      expect(indexer.bulkUpsert).not.toHaveBeenCalled();
    });

    it('fails with 503 when the indexer fails, instead of hiding it', async () => {
      db.findMany.mockResolvedValueOnce(rows(3, 0));
      indexer.bulkUpsert.mockRejectedValue(new Error('search-service down'));
      await expect(service.reindex()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
