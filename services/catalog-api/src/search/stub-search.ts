import { Injectable, Logger } from '@nestjs/common';
import type { ProductResponse } from '../products/dto/product.response';
import {
  type SearchClient,
  type SearchIndexer,
  type SearchResult,
  SearchUnavailableError,
} from './search.ports';

/** Milestone 1.2 stand-in until the HTTP indexer is wired up in 1.4. */
@Injectable()
export class LoggingSearchIndexer implements SearchIndexer {
  private readonly logger = new Logger('SearchIndexer');

  upsert(product: ProductResponse): Promise<void> {
    this.logger.log('index upsert (stub)', { op: 'upsert', id: product.id });
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.logger.log('index remove (stub)', { op: 'remove', id });
    return Promise.resolve();
  }

  bulkUpsert(products: ProductResponse[]): Promise<void> {
    this.logger.log('index bulk upsert (stub)', {
      op: 'bulkUpsert',
      count: products.length,
    });
    return Promise.resolve();
  }
}

/** Milestone 1.2 stand-in: search-service doesn't exist yet. */
@Injectable()
export class UnavailableSearchClient implements SearchClient {
  search(): Promise<SearchResult> {
    return Promise.reject(
      new SearchUnavailableError('search-service is not configured'),
    );
  }
}
