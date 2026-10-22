import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { HttpSearchClient, HttpSearchIndexer } from './http-search';
import { SEARCH_CLIENT, SEARCH_INDEXER } from './search.ports';

/** Binds the search ports to search-service over HTTP. */
@Module({
  providers: [
    {
      provide: SEARCH_INDEXER,
      useFactory: (config: AppConfig) =>
        new HttpSearchIndexer(config.searchServiceUrl),
      inject: [APP_CONFIG],
    },
    {
      provide: SEARCH_CLIENT,
      useFactory: (config: AppConfig) =>
        new HttpSearchClient(config.searchServiceUrl),
      inject: [APP_CONFIG],
    },
  ],
  exports: [SEARCH_INDEXER, SEARCH_CLIENT],
})
export class SearchModule {}
