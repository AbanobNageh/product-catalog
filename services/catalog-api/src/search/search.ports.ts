import type { ProductResponse } from '../products/dto/product.response';

/**
 * Every index write goes through this port (ADR-0001), so switching to an
 * outbox in Part 4 replaces one implementation, not the product code. Calls
 * must be idempotent: upsert replaces the whole document.
 */
export interface SearchIndexer {
  upsert(product: ProductResponse): Promise<void>;
  /** `version` (ms) lets search-service ignore a delete older than a newer write. */
  remove(id: string, version: number): Promise<void>;
}

/**
 * The alias-swap reindex lifecycle: start a build, bulk into it, then finish
 * (swap) or abort. A 409 (SearchServiceError) means the build is gone or
 * another reindex is running. Partial bulk failures are reported, not thrown.
 */
export interface SearchReindexer {
  /** Returns the new build index name. */
  start(): Promise<string>;
  bulk(build: string, products: ProductResponse[]): Promise<BulkIndexResult>;
  finish(build: string): Promise<void>;
  /** Idempotent: also succeeds when the build is already gone. */
  abort(build: string): Promise<void>;
}

/** One product search-service could not index; reindex it later. */
export interface BulkIndexFailure {
  id: string;
  status: number;
  reason: string;
}

/** search-service's bulk answer. `skipped` counts stale versions it ignored on purpose. */
export interface BulkIndexResult {
  indexed: number;
  skipped: number;
  failed: BulkIndexFailure[];
}

/** Search queries go through this port. */
export interface SearchClient {
  /** Throws SearchUnavailableError when search-service can't answer. */
  search(query: SearchQuery): Promise<SearchResult>;
}

export const SEARCH_INDEXER = Symbol('SEARCH_INDEXER');
export const SEARCH_REINDEXER = Symbol('SEARCH_REINDEXER');
export const SEARCH_CLIENT = Symbol('SEARCH_CLIENT');

/** Bumped on every product write; part of every search cache key. */
export const SEARCH_VERSION_KEY = 'search:version';

export class SearchUnavailableError extends Error {
  override name = 'SearchUnavailableError';
}

export type SearchSort =
  'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'stock_asc';

export interface SearchQuery {
  q?: string;
  category?: string;
  brand?: string;
  /** Cents, like priceCents. */
  minPrice?: number;
  /** Cents, like priceCents. */
  maxPrice?: number;
  inStock?: boolean;
  /** Inclusive: only products with stock ≤ maxStock. */
  maxStock?: number;
  sort: SearchSort;
  page: number;
  size: number;
}

export interface Bucket {
  key: string;
  count: number;
}

export interface PriceBucket extends Bucket {
  /** Cents, inclusive. */
  from?: number;
  /** Cents, exclusive. */
  to?: number;
}

/** The response contract search-service implements in milestone 1.3. */
export interface SearchResult {
  hits: ProductResponse[];
  total: number;
  facets: {
    category: Bucket[];
    brand: Bucket[];
    price: PriceBucket[];
  };
}
