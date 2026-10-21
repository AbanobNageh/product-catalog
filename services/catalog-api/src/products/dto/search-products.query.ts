import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { SearchQuery, SearchSort } from '../../search/search.ports';
import { INT4_MAX } from './create-product.dto';

const SORTS: readonly SearchSort[] = ['relevance', 'price_asc', 'price_desc', 'newest'];

/**
 * Optional integer query parameter: blank means unset, plain digits become a
 * number, and anything else (1e3, 0x10, 10.5) stays a string for @IsInt to
 * reject. @Type(() => Number) would turn '' into 0.
 */
function toOptionalInt({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
}

export class SearchProductsQuery implements SearchQuery {
  @ApiPropertyOptional({ description: 'Full-text query on name and description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'electronics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Acme' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Minimum price in cents', example: 10000 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price in cents' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
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

  @ApiPropertyOptional({ enum: SORTS, default: 'relevance' })
  @IsIn(SORTS)
  sort: SearchSort = 'relevance';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}
