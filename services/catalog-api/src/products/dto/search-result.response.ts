import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  Bucket,
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

export class ReindexResponse {
  @ApiProperty({ example: 10000 })
  indexed: number;
}
