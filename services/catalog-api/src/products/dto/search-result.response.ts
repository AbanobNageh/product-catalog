import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  Bucket,
  BulkIndexFailure,
  BulkIndexResult,
  PriceBucket,
  SearchResult,
} from '../../search/search.ports';
import { ProductResponse } from './product.response';

// Swagger classes for the SearchResult contract in search.ports.ts.

class BucketResponse implements Bucket {
  @ApiProperty({ example: 'electronics' })
  key: string;

  @ApiProperty({ example: 42 })
  count: number;
}

class PriceBucketResponse extends BucketResponse implements PriceBucket {
  @ApiPropertyOptional({ description: 'Cents, inclusive' })
  from?: number;

  @ApiPropertyOptional({ description: 'Cents, exclusive' })
  to?: number;
}

class FacetsResponse {
  @ApiProperty({ type: [BucketResponse] })
  category: BucketResponse[];

  @ApiProperty({ type: [BucketResponse] })
  brand: BucketResponse[];

  @ApiProperty({ type: [PriceBucketResponse] })
  price: PriceBucketResponse[];
}

export class SearchResultResponse implements SearchResult {
  @ApiProperty({ type: [ProductResponse] })
  hits: ProductResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty({ type: FacetsResponse })
  facets: FacetsResponse;
}

class ReindexFailureResponse implements BulkIndexFailure {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'Status OpenSearch gave this item',
    example: 400,
  })
  status: number;

  @ApiProperty({ example: 'mapper_parsing_exception: ...' })
  reason: string;
}

export class ReindexResponse implements BulkIndexResult {
  @ApiProperty({ example: 10000 })
  indexed: number;

  @ApiProperty({
    description: 'Stale versions search-service ignored on purpose',
    example: 0,
  })
  skipped: number;

  @ApiProperty({
    type: [ReindexFailureResponse],
    description: 'Products search-service could not index; reindex them later',
  })
  failed: ReindexFailureResponse[];

  @ApiProperty({
    description: 'false when items failed; the old index is still live',
    example: true,
  })
  swapped: boolean;
}
