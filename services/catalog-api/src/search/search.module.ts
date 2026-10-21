import { Module } from '@nestjs/common';
import { SEARCH_CLIENT, SEARCH_INDEXER } from './search.ports';
import { LoggingSearchIndexer, UnavailableSearchClient } from './stub-search';

/** Binds the search ports. 1.4 swaps the stubs for HTTP implementations. */
@Module({
  providers: [
    { provide: SEARCH_INDEXER, useClass: LoggingSearchIndexer },
    { provide: SEARCH_CLIENT, useClass: UnavailableSearchClient },
  ],
  exports: [SEARCH_INDEXER, SEARCH_CLIENT],
})
export class SearchModule {}
