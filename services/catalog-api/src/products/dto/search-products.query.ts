import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { IntQueryParam } from '../../common/int-query-param';
import type { SearchQuery, SearchSort } from '../../search/search.ports';
import { INT4_MAX } from './create-product.dto';

const SORTS: readonly SearchSort[] = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'stock_asc',
];

// Limits search-service also enforces (internal/query/params.go). Checking them
// here gives users catalog-api's own 400 instead of a forwarded error.
const MAX_QUERY_CHARS = 200;
/** OpenSearch's index.max_result_window: page × size beyond it fails. */
const MAX_RESULT_WINDOW = 10000;

/** page × size ≤ 10000. Skipped unless both are integers, so a bad page is reported once. */
const WithinResultWindow = () =>
  ValidateBy({
    name: 'withinResultWindow',
    validator: {
      validate: (page: unknown, args) => {
        const { size } = args?.object as SearchProductsQuery;
        if (!Number.isInteger(page) || !Number.isInteger(size)) return true;
        return (page as number) * size <= MAX_RESULT_WINDOW;
      },
      defaultMessage: () => `page × size must be at most ${MAX_RESULT_WINDOW}`,
    },
  });

/** maxPrice ≥ minPrice when both are set. */
const NotBelowMinPrice = () =>
  ValidateBy({
    name: 'notBelowMinPrice',
    validator: {
      validate: (maxPrice: unknown, args) => {
        const { minPrice } = args?.object as SearchProductsQuery;
        if (!Number.isInteger(maxPrice) || !Number.isInteger(minPrice)) return true;
        return (maxPrice as number) >= (minPrice as number);
      },
      defaultMessage: () => 'maxPrice must not be less than minPrice',
    },
  });

export class SearchProductsQuery implements SearchQuery {
  @ApiPropertyOptional({
    description: 'Full-text query on name and description',
    maxLength: MAX_QUERY_CHARS,
  })
  @IsOptional()
  @IsString()
  // UTF-16 length is never below search-service's rune count, so this is never looser.
  @MaxLength(MAX_QUERY_CHARS)
  q?: string;

  @ApiPropertyOptional({ example: 'electronics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Acme' })
  @IsOptional()
  @IsString()
  brand?: string;

  @IntQueryParam({ min: 0, max: INT4_MAX, description: 'Minimum price in cents', example: 10000 })
  minPrice?: number;

  @IntQueryParam({ min: 0, max: INT4_MAX, description: 'Maximum price in cents, at least minPrice' })
  @NotBelowMinPrice()
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Only products with stock > 0' })
  @IsOptional()
  // Query strings are strings: map exactly 'true'/'false', leave anything else
  // for @IsBoolean to reject (Boolean('false') would be true).
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  inStock?: boolean;

  @IntQueryParam({
    min: 0,
    max: INT4_MAX,
    description:
      'Only products with stock ≤ maxStock, for example 5 for low stock (0: out of stock only). Combine with sort=stock_asc',
    example: 5,
  })
  maxStock?: number;

  @ApiPropertyOptional({
    enum: SORTS,
    default: 'relevance',
    description:
      'relevance needs q (without q it falls back to newest); stock_asc sorts by stock, lowest first. Ties are ordered by id',
  })
  @IsIn(SORTS)
  sort: SearchSort = 'relevance';

  @IntQueryParam({
    min: 1,
    max: INT4_MAX,
    default: 1,
    description: `page × size must be at most ${MAX_RESULT_WINDOW}`,
  })
  @WithinResultWindow()
  page: number = 1;

  @IntQueryParam({ min: 1, max: 100, default: 20 })
  size: number = 20;
}
