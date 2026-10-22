import { Controller, HttpCode, Post } from '@nestjs/common';
import {
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

  /** Rebuilds the search index from Postgres, for example after search-service was down. */
  @Post('reindex')
  @HttpCode(200)
  @ApiOkResponse({
    type: ReindexResponse,
    description: '200 even when some items fail; see `failed`',
  })
  @ApiServiceUnavailableResponse({
    description: 'search-service is unavailable',
  })
  @ApiInternalServerErrorResponse({
    description: 'Failed for another reason, such as Postgres being down',
  })
  reindex(): Promise<ReindexResponse> {
    return this.products.reindex();
  }
}
