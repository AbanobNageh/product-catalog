import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReindexResponse } from './dto/search-result.response';
import { ProductsService } from './products.service';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly products: ProductsService) {}

  /**
   * Rebuilds the search index from Postgres into a new index and swaps it in,
   * for example after search-service was down. Product writes keep working
   * while it runs.
   */
  @Post('reindex')
  @HttpCode(200)
  @ApiOkResponse({
    type: ReindexResponse,
    description:
      '200 even when some items fail; see `failed`. Then `swapped` is false and the old index stays live',
  })
  @ApiConflictResponse({
    description:
      'A reindex is already running, or this one was aborted or replaced',
  })
  @ApiServiceUnavailableResponse({
    description:
      'search-service is unavailable. The reindex may already have swapped; running it again is safe',
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed for another reason, such as Postgres being down',
  })
  reindex(): Promise<ReindexResponse> {
    return this.products.reindex();
  }
}
