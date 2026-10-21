import type { ProductResponse } from '../products/dto/product.response';

/**
 * Every index write goes through this port (ADR-0001), so switching to an
 * outbox in Part 4 replaces one implementation, not the product code. Calls
 * must be idempotent: upsert replaces the whole document.
 */
export interface SearchIndexer {
  upsert(product: ProductResponse): Promise<void>;
  remove(id: string): Promise<void>;
  bulkUpsert(products: ProductResponse[]): Promise<void>;
}

/** Search queries go through this port. */
export interface SearchClient {
  /** Throws SearchUnavailableError when search-service can't answer. */
  search(query: SearchQuery): Promise<SearchResult>;
}

export const SEARCH_INDEXER = Symbol('SEARCH_INDEXER');
export const SEARCH_CLIENT = Symbol('SEARCH_CLIENT');

/** Bumped on every product write; part of every search cache key. */
export const SEARCH_VERSION_KEY = 'search:version';

export class SearchUnavailableError extends Error {
  override name = 'SearchUnavailableError';
}

export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest';

export interface SearchQuery {
  q?: string;
  category?: string;
  brand?: string;
  /** Cents, like priceCents. */
  minPrice?: number;
  /** Cents, like priceCents. */
  maxPrice?: number;
  inStock?: boolean;
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
