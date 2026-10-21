import { ApiProperty } from '@nestjs/swagger';
import type { Product } from '../../generated/prisma/client';

/**
 * A product as the API returns it, and as it is cached and sent to the search
 * index. Dates are ISO strings so the cached and fresh responses are identical.
 */
export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'PHN-ACME-001' })
  sku: string;

  @ApiProperty({ example: 'Acme Phone 12' })
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ example: 'electronics' })
  category: string;

  @ApiProperty({ example: 'Acme' })
  brand: string;

  @ApiProperty({ description: 'Price in cents', example: 1999900 })
  priceCents: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiProperty({ example: 25 })
  stock: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class ProductPage {
  @ApiProperty({ type: [ProductResponse] })
  items: ProductResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export function toProductResponse(p: Product): ProductResponse {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    category: p.category,
    brand: p.brand,
    priceCents: p.priceCents,
    currency: p.currency,
    stock: p.stock,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
