import type { ProductResponse } from '../products/dto/product.response';
import { callSearchService } from './search-service-fetch';
import type {
  BulkIndexResult,
  SearchClient,
  SearchIndexer,
  SearchQuery,
  SearchResult,
} from './search.ports';

export interface SearchTimeouts {
  /** Single calls: search, upsert, remove. */
  requestMs: number;
  /** Bulk: at least search-service's own 10s bulk deadline, so its 503 arrives first. */
  bulkMs: number;
}

export const SEARCH_TIMEOUTS: SearchTimeouts = {
  requestMs: 2000,
  bulkMs: 15000,
};

const productUrl = (baseUrl: string, id: string) =>
  `${baseUrl}/products/${encodeURIComponent(id)}`;

/** Index writes over HTTP to search-service (ADR-0001: one port, swappable later). */
export class HttpSearchIndexer implements SearchIndexer {
  constructor(
    private readonly baseUrl: string,
    private readonly timeouts: SearchTimeouts = SEARCH_TIMEOUTS,
  ) {}

  async upsert(product: ProductResponse): Promise<void> {
    await callSearchService(
      'PUT',
      productUrl(this.baseUrl, product.id),
      product,
      this.timeouts.requestMs,
    );
  }

  async remove(id: string): Promise<void> {
    await callSearchService(
      'DELETE',
      productUrl(this.baseUrl, id),
      undefined,
      this.timeouts.requestMs,
    );
  }

  async bulkUpsert(products: ProductResponse[]): Promise<BulkIndexResult> {
    const result = await callSearchService<BulkIndexResult>(
      'POST',
      `${this.baseUrl}/products/_bulk`,
      { products },
      this.timeouts.bulkMs,
    );
    return result ?? { indexed: 0, skipped: 0, failed: [] };
  }
}

/** Search queries over HTTP; search-service's JSON is the SearchResult contract. */
export class HttpSearchClient implements SearchClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeouts: SearchTimeouts = SEARCH_TIMEOUTS,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const result = await callSearchService<SearchResult>(
      'GET',
      `${this.baseUrl}/search?${toSearchParams(query).toString()}`,
      undefined,
      this.timeouts.requestMs,
    );
    if (!result)
      throw new Error('search-service returned an empty search response');
    return result;
  }
}

/** Query string for GET /search. Only undefined is left out: 0 and false are real filters. */
export function toSearchParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}
