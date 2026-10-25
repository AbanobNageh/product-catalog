import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type Product } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisCache } from '../redis/redis-cache';
import { searchCacheKey } from '../search/search-cache-key';
import { SearchServiceError } from '../search/search-service-fetch';
import {
  SEARCH_VERSION_KEY,
  type BulkIndexResult,
  type SearchClient,
  type SearchIndexer,
  type SearchQuery,
  type SearchReindexer,
  type SearchResult,
  SearchUnavailableError,
} from '../search/search.ports';
import {
  type ProductResponse,
  toProductResponse,
} from './dto/product.response';
import { ProductsService } from './products.service';

const ID = '0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01';
const BUILD = 'products-v2';

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
  version: 1,
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
  let reindexer: jest.Mocked<SearchReindexer>;
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
    };
    reindexer = {
      start: jest.fn().mockResolvedValue(BUILD),
      // Like search-service: everything sent was indexed.
      bulk: jest.fn<Promise<BulkIndexResult>, [string, ProductResponse[]]>(
        (_build, batch) =>
          Promise.resolve({ indexed: batch.length, skipped: 0, failed: [] }),
      ),
      finish: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    };
    searchClient = { search: jest.fn() };
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    service = new ProductsService(
      { product: db } as unknown as PrismaService,
      cache as unknown as RedisCache,
      indexer,
      reindexer,
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

    // A product cached before 5.2 has no version: serving it would send ETag "undefined".
    it('treats a cached product without a version as a miss (cached before 5.2)', async () => {
      const { version: _, ...stale } = toProductResponse(product);
      cache.getJson.mockResolvedValue(stale);
      db.findUnique.mockResolvedValue(product);
      await expect(service.findOne(ID)).resolves.toMatchObject({ version: 1 });
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
      await expect(service.create(createBody)).rejects.toThrow(
        'connection lost',
      );
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
        data: { priceCents: 1, version: { increment: 1 } },
      });
      expect(cache.del).toHaveBeenCalledWith(`product:${ID}`);
      expect(indexer.upsert).toHaveBeenCalledWith(toProductResponse(updated));
      const [del] = cache.del.mock.invocationCallOrder;
      const [upsert] = indexer.upsert.mock.invocationCallOrder;
      const [incr] = cache.incr.mock.invocationCallOrder;
      expect(del).toBeLessThan(upsert);
      expect(upsert).toBeLessThan(incr);
    });

    it('with a matching version, updates where id and version match', async () => {
      db.update.mockResolvedValue({ ...product, stock: 5, version: 4 });
      await expect(service.update(ID, { stock: 5 }, 3)).resolves.toMatchObject({
        stock: 5,
        version: 4,
      });
      expect(db.update).toHaveBeenCalledWith({
        where: { id: ID, version: 3 },
        data: { stock: 5, version: { increment: 1 } },
      });
    });

    it('with a stale version, throws 412 with the current version and drops only the cached copy', async () => {
      db.update.mockRejectedValue(prismaError('P2025'));
      db.findUnique.mockResolvedValue({ version: 4 });
      const err = await service.update(ID, { stock: 5 }, 3).catch((e) => e);
      expect(err).toBeInstanceOf(PreconditionFailedException);
      expect(err.getResponse()).toEqual({
        statusCode: 412,
        message: 'product changed: you sent version 3, current is 4',
        error: 'Precondition Failed',
        currentVersion: 4,
      });
      expect(db.findUnique).toHaveBeenCalledWith({
        where: { id: ID },
        select: { version: true },
      });
      // A stale cached copy would hand the re-reading client the old ETag again
      // (412 loop): drop it so the re-read comes from Postgres.
      expect(cache.del).toHaveBeenCalledWith(`product:${ID}`);
      expect(indexer.upsert).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('with a version, maps a missing product to 404, not 412', async () => {
      db.update.mockRejectedValue(prismaError('P2025'));
      db.findUnique.mockResolvedValue(null);
      await expect(service.update(ID, { stock: 5 }, 3)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an empty body before touching the database, even with a version', async () => {
      await expect(service.update(ID, {}, 3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.update).not.toHaveBeenCalled();
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
      expect(db.findUnique).not.toHaveBeenCalled();
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
      expect(indexer.remove).toHaveBeenCalledWith(ID, expect.any(Number));
      expect(indexer.remove.mock.invocationCallOrder[0]).toBeLessThan(
        cache.incr.mock.invocationCallOrder[0],
      );
    });

    it('with a matching version, deletes where id and version match', async () => {
      db.delete.mockResolvedValue(product);
      await service.remove(ID, 3);
      expect(db.delete).toHaveBeenCalledWith({ where: { id: ID, version: 3 } });
    });

    it('with a stale version, throws 412, drops the cached copy and leaves the index alone', async () => {
      db.delete.mockRejectedValue(prismaError('P2025'));
      db.findUnique.mockResolvedValue({ version: 4 });
      const err = await service.remove(ID, 3).catch((e) => e);
      expect(err).toBeInstanceOf(PreconditionFailedException);
      expect(err.getResponse()).toMatchObject({ currentVersion: 4 });
      expect(cache.del).toHaveBeenCalledWith(`product:${ID}`);
      expect(indexer.remove).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('with a version, maps a missing product to 404', async () => {
      db.delete.mockRejectedValue(prismaError('P2025'));
      db.findUnique.mockResolvedValue(null);
      await expect(service.remove(ID, 3)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps an unknown id to NotFound and has no side effects', async () => {
      db.delete.mockRejectedValue(prismaError('P2025'));
      await expect(service.remove(ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(indexer.remove).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('succeeds and logs when the index call fails', async () => {
      db.delete.mockResolvedValue(product);
      indexer.remove.mockRejectedValue(new Error('search-service down'));
      await expect(service.remove(ID)).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
      expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
    });

    // ADR-0007: the delete must outrank the product's last upsert (version = updatedAt).
    describe('remove sends max(now, updatedAt + 1)', () => {
      afterEach(() => jest.useRealTimers());

      it('uses updatedAt + 1 when the clock is behind the deleted row', async () => {
        jest
          .useFakeTimers()
          .setSystemTime(product.updatedAt.getTime() - 60_000);
        db.delete.mockResolvedValue(product);
        await service.remove(ID);
        expect(indexer.remove).toHaveBeenCalledWith(
          ID,
          product.updatedAt.getTime() + 1,
        );
      });

      it('uses now when the clock is ahead of the deleted row', async () => {
        const now = product.updatedAt.getTime() + 60_000;
        jest.useFakeTimers().setSystemTime(now);
        db.delete.mockResolvedValue(product);
        await service.remove(ID);
        expect(indexer.remove).toHaveBeenCalledWith(ID, now);
      });
    });
  });

  describe('search', () => {
    const query: SearchQuery = {
      q: 'phone',
      sort: 'relevance',
      page: 1,
      size: 20,
    };
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
    const failure = { id: 'x', status: 400, reason: 'r' };
    const conflict = () => new SearchServiceError(409, 'build gone');

    it('sends Postgres to the build in batches of 500, then bumps the version once', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(500, 500))
        .mockResolvedValueOnce(rows(201, 1000));
      await expect(service.reindex()).resolves.toEqual({
        indexed: 1201,
        skipped: 0,
        failed: [],
        swapped: true,
      });
      expect(reindexer.bulk.mock.calls.map(([, b]) => b.length)).toEqual([
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

    it('reindex starts, bulks every batch into the build, finishes', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(7, 500));
      await expect(service.reindex()).resolves.toEqual({
        indexed: 507,
        skipped: 0,
        failed: [],
        swapped: true,
      });
      expect(reindexer.start).toHaveBeenCalledTimes(1);
      expect(reindexer.bulk).toHaveBeenCalledTimes(2);
      expect(reindexer.bulk.mock.calls.map(([build]) => build)).toEqual([
        BUILD,
        BUILD,
      ]);
      expect(reindexer.finish).toHaveBeenCalledTimes(1);
      expect(reindexer.finish).toHaveBeenCalledWith(BUILD);
      expect(reindexer.abort).not.toHaveBeenCalled();
      const [start] = reindexer.start.mock.invocationCallOrder;
      const bulks = reindexer.bulk.mock.invocationCallOrder;
      const [finish] = reindexer.finish.mock.invocationCallOrder;
      const [incr] = cache.incr.mock.invocationCallOrder;
      expect(start).toBeLessThan(bulks[0]);
      expect(bulks[1]).toBeLessThan(finish);
      // The cache version moves only after the swap, so no search caches the old index under it.
      expect(finish).toBeLessThan(incr);
    });

    it('swaps in an empty index for an empty table', async () => {
      db.findMany.mockResolvedValueOnce([]);
      await expect(service.reindex()).resolves.toEqual({
        indexed: 0,
        skipped: 0,
        failed: [],
        swapped: true,
      });
      expect(reindexer.bulk).not.toHaveBeenCalled();
      expect(reindexer.finish).toHaveBeenCalledWith(BUILD);
    });

    // Review Focus 3: partial failures are reported, not thrown or dropped.
    it('reindex aborts instead of swapping when items failed', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(1, 500));
      reindexer.bulk
        .mockResolvedValueOnce({ indexed: 500, skipped: 0, failed: [] })
        .mockResolvedValueOnce({ indexed: 0, skipped: 1, failed: [failure] });
      await expect(service.reindex()).resolves.toEqual({
        indexed: 500,
        skipped: 1,
        failed: [failure],
        swapped: false,
      });
      expect(reindexer.abort).toHaveBeenCalledTimes(1);
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
      expect(reindexer.finish).not.toHaveBeenCalled();
      expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
    });

    it('fails with 503 when the abort after failed items cannot reach search-service', async () => {
      db.findMany.mockResolvedValueOnce(rows(1, 0));
      reindexer.bulk.mockResolvedValueOnce({
        indexed: 0,
        skipped: 0,
        failed: [failure],
      });
      reindexer.abort.mockRejectedValue(new SearchUnavailableError('down'));
      await expect(service.reindex()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // No retries: one abort only.
      expect(reindexer.abort).toHaveBeenCalledTimes(1);
      expect(reindexer.finish).not.toHaveBeenCalled();
    });

    it('reindex returns 409 when one is already running', async () => {
      reindexer.start.mockRejectedValue(conflict());
      const err = await service.reindex().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe('a reindex is already running');
      expect(db.findMany).not.toHaveBeenCalled();
      expect(reindexer.bulk).not.toHaveBeenCalled();
      // There is no build of ours to abort.
      expect(reindexer.abort).not.toHaveBeenCalled();
    });

    it('fails with 503 when search-service is unavailable at start', async () => {
      reindexer.start.mockRejectedValue(new SearchUnavailableError('down'));
      const err = await service.reindex().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as Error).message).toContain('search is unavailable');
      expect(reindexer.abort).not.toHaveBeenCalled();
    });

    it('rethrows a search-service contract error at start', async () => {
      const contract = new SearchServiceError(400, 'bad body');
      reindexer.start.mockRejectedValue(contract);
      await expect(service.reindex()).rejects.toBe(contract);
      expect(reindexer.abort).not.toHaveBeenCalled();
    });

    it('reindex aborts and returns 409 when the build is gone mid-run', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(3, 500));
      reindexer.bulk
        .mockResolvedValueOnce({ indexed: 500, skipped: 0, failed: [] })
        .mockRejectedValueOnce(conflict());
      const err = await service.reindex().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe(
        'the reindex was aborted or replaced; run it again',
      );
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
      expect(reindexer.finish).not.toHaveBeenCalled();
    });

    it('aborts and returns 409 when finish finds the build gone', async () => {
      db.findMany.mockResolvedValueOnce(rows(3, 0));
      reindexer.finish.mockRejectedValue(conflict());
      const err = await service.reindex().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as Error).message).toBe(
        'the reindex was aborted or replaced; run it again',
      );
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
    });

    it('aborts and fails with 503 when search-service goes down mid-run, saying how far it got', async () => {
      db.findMany
        .mockResolvedValueOnce(rows(500, 0))
        .mockResolvedValueOnce(rows(3, 500));
      reindexer.bulk
        .mockResolvedValueOnce({ indexed: 500, skipped: 0, failed: [] })
        .mockRejectedValueOnce(new SearchUnavailableError('down'));
      const err = await service.reindex().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as Error).message).toContain('after 500 products');
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
      expect(cache.incr).toHaveBeenCalledTimes(1);
    });

    // Review Focus 4: a database failure is not "search is unavailable".
    it('reindex aborts and rethrows a Postgres error', async () => {
      const dbDown = new Error('db down');
      db.findMany.mockRejectedValueOnce(dbDown);
      await expect(service.reindex()).rejects.toBe(dbDown);
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
      expect(reindexer.finish).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalled();
    });

    it('aborts and rethrows a search-service contract error mid-run instead of calling it unavailable', async () => {
      db.findMany.mockResolvedValueOnce(rows(3, 0));
      const contract = new SearchServiceError(400, 'bad body');
      reindexer.bulk.mockRejectedValueOnce(contract);
      await expect(service.reindex()).rejects.toBe(contract);
      expect(reindexer.abort).toHaveBeenCalledWith(BUILD);
    });

    describe('abort failure does not mask the original error', () => {
      beforeEach(() => {
        reindexer.abort.mockRejectedValue(new SearchUnavailableError('down'));
      });

      it('keeps a Postgres error', async () => {
        const dbDown = new Error('db down');
        db.findMany.mockRejectedValueOnce(dbDown);
        await expect(service.reindex()).rejects.toBe(dbDown);
        expect(reindexer.abort).toHaveBeenCalledTimes(1);
        expect(logError).toHaveBeenCalledWith(
          expect.stringContaining('abort failed'),
          expect.anything(),
        );
      });

      it('keeps a mid-run 409', async () => {
        db.findMany.mockResolvedValueOnce(rows(3, 0));
        reindexer.bulk.mockRejectedValueOnce(conflict());
        await expect(service.reindex()).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(reindexer.abort).toHaveBeenCalledTimes(1);
      });
    });

    describe('bumps the search version on every path', () => {
      it.each([
        ['success', () => db.findMany.mockResolvedValueOnce(rows(3, 0))],
        ['a 409 at start', () => reindexer.start.mockRejectedValue(conflict())],
        [
          'unavailable at start',
          () =>
            reindexer.start.mockRejectedValue(
              new SearchUnavailableError('down'),
            ),
        ],
        [
          'failed items',
          () => {
            db.findMany.mockResolvedValueOnce(rows(1, 0));
            reindexer.bulk.mockResolvedValueOnce({
              indexed: 0,
              skipped: 0,
              failed: [failure],
            });
          },
        ],
        [
          'a mid-run 409',
          () => {
            db.findMany.mockResolvedValueOnce(rows(3, 0));
            reindexer.bulk.mockRejectedValueOnce(conflict());
          },
        ],
        [
          'a Postgres error',
          () => db.findMany.mockRejectedValueOnce(new Error('db down')),
        ],
      ])('%s', async (_name, arrange) => {
        arrange();
        await service.reindex().catch(() => undefined);
        expect(cache.incr).toHaveBeenCalledTimes(1);
        expect(cache.incr).toHaveBeenCalledWith(SEARCH_VERSION_KEY);
      });
    });
  });
});
