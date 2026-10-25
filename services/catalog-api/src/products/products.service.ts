import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCache } from '../redis/redis-cache';
import { searchCacheKey } from '../search/search-cache-key';
import { SearchServiceError } from '../search/search-service-fetch';
import {
  SEARCH_CLIENT,
  SEARCH_INDEXER,
  SEARCH_REINDEXER,
  SEARCH_VERSION_KEY,
  type SearchClient,
  type SearchIndexer,
  type SearchQuery,
  type SearchReindexer,
  type SearchResult,
  SearchUnavailableError,
} from '../search/search.ports';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQuery } from './dto/list-products.query';
import {
  type ProductPage,
  type ProductResponse,
  toProductResponse,
} from './dto/product.response';
import type { ReindexResponse } from './dto/search-result.response';
import type { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_TTL_SECONDS = 300;
const SEARCH_TTL_SECONDS = 60;
const REINDEX_BATCH_SIZE = 500;

const productKey = (id: string) => `product:${id}`;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCache,
    @Inject(SEARCH_INDEXER) private readonly indexer: SearchIndexer,
    @Inject(SEARCH_REINDEXER) private readonly reindexer: SearchReindexer,
    @Inject(SEARCH_CLIENT) private readonly searchClient: SearchClient,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    const product = toProductResponse(
      await this.prisma.product.create({ data: dto }).catch(mapPrismaError),
    );
    await this.afterWrite('upsert', product.id, () =>
      this.indexer.upsert(product),
    );
    return product;
  }

  /** Cache-aside on `product:<id>`, TTL 5 minutes. */
  async findOne(id: string): Promise<ProductResponse> {
    const key = productKey(id);
    const cached = await this.cache.getJson<ProductResponse>(key);
    // Cached before 5.2 (no version): a miss, or the ETag would be "undefined".
    if (cached && typeof cached.version === 'number') return cached;

    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`product ${id} not found`);
    const product = toProductResponse(row);
    await this.cache.setJson(key, product, PRODUCT_TTL_SECONDS);
    return product;
  }

  /** Straight from Postgres; lists are not cached (spec). */
  async list({ page, limit }: ListProductsQuery): Promise<ProductPage> {
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.product.count(),
    ]);
    return { items: rows.map(toProductResponse), total, page, limit };
  }

  /**
   * Every update increments `version`. With `expectedVersion` (from If-Match)
   * the version is part of the WHERE clause, so a concurrent write makes this
   * one match no row instead of overwriting it (ADR-0019).
   */
  async update(
    id: string,
    dto: UpdateProductDto,
    expectedVersion?: number,
  ): Promise<ProductResponse> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('at least one field is required');
    }
    const product = toProductResponse(
      await this.prisma.product
        .update({
          where: whereVersion(id, expectedVersion),
          // The DTO is plain data; Prisma wants a plain object, not its prototype.
          // oxlint-disable-next-line typescript/no-misused-spread
          data: { ...dto, version: { increment: 1 } },
        })
        .catch((err: unknown) => this.mapWriteError(err, id, expectedVersion)),
    );
    await this.cache.del(productKey(id));
    await this.afterWrite('upsert', id, () => this.indexer.upsert(product));
    return product;
  }

  /**
   * The delete is versioned (ADR-0007) so it outranks the product's last
   * upsert (version = updatedAt), even if this clock is behind the one that
   * wrote it, and leaves a tombstone that rejects a reindex's stale copy.
   */
  async remove(id: string, expectedVersion?: number): Promise<void> {
    const row = await this.prisma.product
      .delete({ where: whereVersion(id, expectedVersion) })
      .catch((err: unknown) => this.mapWriteError(err, id, expectedVersion));
    const indexVersion = Math.max(Date.now(), row.updatedAt.getTime() + 1);
    await this.cache.del(productKey(id));
    await this.afterWrite('remove', id, () =>
      this.indexer.remove(id, indexVersion),
    );
  }

  /**
   * Proxies to search-service, cached for 60s under the current search
   * version. If the version can't be read (Redis down), the cache is skipped
   * rather than risk serving results from before a write.
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    const version = await this.cache.getCounter(SEARCH_VERSION_KEY);
    const key =
      version === undefined ? undefined : searchCacheKey(query, version);
    if (key) {
      const cached = await this.cache.getJson<SearchResult>(key);
      if (cached) return cached;
    }

    let result: SearchResult;
    try {
      result = await this.searchClient.search(query);
    } catch (err) {
      if (err instanceof SearchUnavailableError) {
        this.logger.warn('search unavailable', { err: err.message });
        throw new ServiceUnavailableException(
          'search is temporarily unavailable',
        );
      }
      throw err;
    }
    if (key) await this.cache.setJson(key, result, SEARCH_TTL_SECONDS);
    return result;
  }

  /**
   * Rebuilds the index from Postgres, the source of truth, into a fresh build
   * index, then swaps the alias (ADR-0007). Live writes keep working:
   * search-service dual-writes them into the build. Unlike per-write
   * indexing, a failure here is returned to the caller, who asked for it.
   * If any item failed, the build is aborted rather than swapped (the old
   * index, which still has those products, stays live): a 200 with
   * `swapped: false` and the items in `failed`.
   */
  async reindex(): Promise<ReindexResponse> {
    try {
      const build = await this.startReindex();
      return await this.buildAndSwap(build);
    } finally {
      // Even a failed reindex may have changed results, so drop cached searches.
      await this.cache.incr(SEARCH_VERSION_KEY);
    }
  }

  private async startReindex(): Promise<string> {
    try {
      return await this.reindexer.start();
    } catch (err) {
      if (err instanceof SearchServiceError && err.status === 409) {
        this.logger.warn('reindex refused: one is already running');
        throw new ConflictException('a reindex is already running');
      }
      this.logger.error('reindex failed to start', { err: String(err) });
      throw reindexError(err, 0);
    }
  }

  private async buildAndSwap(build: string): Promise<ReindexResponse> {
    const result = {
      indexed: 0,
      skipped: 0,
      failed: [] as ReindexResponse['failed'],
    };
    let sent = 0;
    try {
      let lastId: string | undefined;
      for (;;) {
        const rows = await this.prisma.product.findMany({
          where: lastId ? { id: { gt: lastId } } : undefined,
          orderBy: { id: 'asc' },
          take: REINDEX_BATCH_SIZE,
        });
        if (rows.length === 0) break;
        const batch = await this.reindexer.bulk(
          build,
          rows.map(toProductResponse),
        );
        result.indexed += batch.indexed;
        result.skipped += batch.skipped;
        result.failed.push(...batch.failed);
        sent += rows.length;
        lastId = rows[rows.length - 1].id;
        if (rows.length < REINDEX_BATCH_SIZE) break;
      }
      if (result.failed.length === 0) {
        await this.reindexer.finish(build);
        this.logger.log('reindex swapped', {
          build,
          indexed: result.indexed,
          skipped: result.skipped,
        });
        return { ...result, swapped: true };
      }
    } catch (err) {
      this.logger.error('reindex failed', { build, sent, err: String(err) });
      await this.abortQuietly(build);
      throw reindexError(err, sent);
    }

    // Swapping would drop the failed products from search; keep the old index.
    this.logger.warn('reindex not swapped: items failed', {
      build,
      failed: result.failed.length,
    });
    try {
      await this.reindexer.abort(build);
    } catch (err) {
      this.logger.error(
        'reindex abort failed; the build blocks the next reindex until it is 10 minutes old',
        { build, failed: result.failed.length, err: String(err) },
      );
      throw reindexError(err, sent);
    }
    return { ...result, swapped: false };
  }

  /**
   * With an expected version, "no row matched" (P2025) is either a missing
   * product (404) or a newer version (412); one more read tells them apart.
   */
  private async mapWriteError(
    err: unknown,
    id: string,
    expectedVersion: number | undefined,
  ): Promise<never> {
    if (
      expectedVersion !== undefined &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      const current = await this.prisma.product.findUnique({
        where: { id },
        select: { version: true },
      });
      if (!current) throw new NotFoundException('product not found');
      // A stale cached copy (a failed del, or a read racing the last write)
      // would give the re-reading client the old ETag again: drop it.
      await this.cache.del(productKey(id));
      throw new PreconditionFailedException({
        statusCode: 412,
        message: `product changed: you sent version ${expectedVersion}, current is ${current.version}`,
        error: 'Precondition Failed',
        currentVersion: current.version,
      });
    }
    return mapPrismaError(err);
  }

  /** Best effort: a failed abort is logged, never thrown over the original error. */
  private async abortQuietly(build: string): Promise<void> {
    try {
      await this.reindexer.abort(build);
    } catch (err) {
      this.logger.error(
        'reindex abort failed; the build blocks the next reindex until it is 10 minutes old',
        { build, err: String(err) },
      );
    }
  }

  /**
   * Runs after a successful Postgres write. The index call is not retried
   * (ADR-0001). If it fails, the write still succeeds and the error is logged.
   * The search-cache version is bumped only after the index call, so a search
   * can't cache pre-write index results under the new version.
   */
  private async afterWrite(
    op: string,
    id: string,
    indexCall: () => Promise<void>,
  ): Promise<void> {
    try {
      await indexCall();
    } catch (err) {
      this.logger.error(
        'search index call failed; the index is stale until POST /admin/reindex',
        { op, id, err: String(err) },
      );
    }
    await this.cache.incr(SEARCH_VERSION_KEY);
  }
}

/**
 * Maps a reindex failure: the build gone after start (409) or search-service
 * down (503). Anything else, such as Postgres, is rethrown as is (500).
 */
function reindexError(err: unknown, sent: number): unknown {
  if (err instanceof SearchServiceError && err.status === 409) {
    return new ConflictException(
      'the reindex was aborted or replaced; run it again',
    );
  }
  if (err instanceof SearchUnavailableError) {
    return new ServiceUnavailableException(
      `reindex failed after ${sent} products: search is unavailable`,
    );
  }
  return err;
}

function whereVersion(id: string, expectedVersion: number | undefined) {
  return expectedVersion === undefined
    ? { id }
    : { id, version: expectedVersion };
}

/** Turns the Prisma errors a client can cause into HTTP errors. */
function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new ConflictException('sku already exists');
    if (err.code === 'P2025') throw new NotFoundException('product not found');
  }
  throw err;
}
