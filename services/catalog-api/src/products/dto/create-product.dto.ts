import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUppercase,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Largest value a Postgres `integer` column holds. */
export const INT4_MAX = 2_147_483_647;

export class CreateProductDto {
  @ApiProperty({ example: 'PHN-ACME-001' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 'Acme Phone 12' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '6.1" screen, 128 GB' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'electronics' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Acme' })
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({
    description: 'Price in cents (integer)',
    example: 1999900,
    minimum: 0,
    maximum: INT4_MAX,
  })
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  priceCents: number;

  @ApiPropertyOptional({
    description: 'ISO 4217 code; the database defaults to EGP',
    example: 'EGP',
  })
  // Not @IsOptional(): that also lets null through, and the column is NOT NULL.
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(3, 3)
  @IsUppercase()
  currency?: string;

  @ApiProperty({ example: 25, minimum: 0, maximum: INT4_MAX })
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  stock: number;
}
