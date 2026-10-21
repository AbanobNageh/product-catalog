import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * Any subset of the create fields. An empty body is rejected by the service.
 * skipNullProperties: false makes the fields optional for undefined only, so
 * `{"name": null}` is a 400 instead of reaching a NOT NULL column.
 */
export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
