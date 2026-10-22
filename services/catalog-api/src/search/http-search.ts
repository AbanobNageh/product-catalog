import type { ProductResponse } from '../products/dto/product.response';
import { callSearchService } from './search-service-fetch';
import type {
  BulkIndexResult,
  SearchClient,
  SearchIndexer,
  SearchQuery,
  SearchReindexer,
  SearchResult,
} from './search.ports';

export interface SearchTimeouts {
  /** Single calls: search, upsert, remove. */
  requestMs: number;
  /**
   * Reindex calls (start, bulk, finish, abort). search-service bounds each
   * OpenSearch call at 10s, but start, bulk and finish chain several, so this
   * timeout can fire first. That is safe: every call after start names its
   * build, so a call that lands late can't touch another run's build. A start
   * that times out may still have created a build, which blocks the next
   * reindex until it is 10 minutes old.
   */
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

  async remove(id: string, version: number): Promise<void> {
    await callSearchService(
      'DELETE',
      `${productUrl(this.baseUrl, id)}?version=${version}`,
      undefined,
      this.timeouts.requestMs,
    );
  }
}

/** The reindex lifecycle over HTTP. All four calls get the longer reindex timeout; no retries. */
export class HttpSearchReindexer implements SearchReindexer {
  constructor(
    private readonly baseUrl: string,
    private readonly timeouts: SearchTimeouts = SEARCH_TIMEOUTS,
  ) {}

  async start(): Promise<string> {
    const result = await callSearchService<{ build?: string }>(
      'POST',
      `${this.baseUrl}/reindex/start`,
      undefined,
      this.timeouts.bulkMs,
    );
    if (!result?.build)
      throw new Error(
        'search-service returned an empty reindex start response',
      );
    return result.build;
  }

  async bulk(
    build: string,
    products: ProductResponse[],
  ): Promise<BulkIndexResult> {
    const result = await callSearchService<BulkIndexResult>(
      'POST',
      `${this.baseUrl}/reindex/_bulk`,
      { build, products },
      this.timeouts.bulkMs,
    );
    if (!result)
      throw new Error('search-service returned an empty bulk response');
    return result;
  }

  async finish(build: string): Promise<void> {
    await callSearchService(
      'POST',
      `${this.baseUrl}/reindex/finish`,
      { build },
      this.timeouts.bulkMs,
    );
  }

  async abort(build: string): Promise<void> {
    await callSearchService(
      'POST',
      `${this.baseUrl}/reindex/abort`,
      { build },
      this.timeouts.bulkMs,
    );
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
