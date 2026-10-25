import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPreconditionFailedResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireScope } from '../auth/auth.decorators';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { PreconditionFailedResponse } from './dto/precondition-failed.response';
import { ProductPage, ProductResponse } from './dto/product.response';
import { SearchProductsQuery } from './dto/search-products.query';
import { SearchResultResponse } from './dto/search-result.response';
import { UpdateProductDto } from './dto/update-product.dto';
import { etag, parseIfMatch } from './if-match';
import { ProductsService } from './products.service';

// ADR-0019: the product's version as a strong ETag, sent back in If-Match.
const ETAG_HEADER = {
  ETag: {
    description: 'The product version in quotes, for example "3"; send it as If-Match',
    schema: { type: 'string' },
  },
};
const IF_MATCH_HEADER = {
  name: 'If-Match',
  required: false,
  description:
    'Optional. The ETag from GET /products/:id, for example "3". A stale version gets 412; anything but one strong ETag gets 400',
};

/** Sets the ETag; Express then keeps it instead of its own body hash. */
function withETag(res: Response, product: ProductResponse): ProductResponse {
  res.setHeader('ETag', etag(product.version));
  return product;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @RequireScope('write')
  @ApiCreatedResponse({ type: ProductResponse, headers: ETAG_HEADER })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiConflictResponse({ description: 'sku already exists' })
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withETag(res, await this.products.create(dto));
  }

  @Get()
  @RequireScope('read')
  @ApiOkResponse({ type: ProductPage })
  list(@Query() query: ListProductsQuery): Promise<ProductPage> {
    return this.products.list(query);
  }

  // Declared before ':id' so "search" isn't treated as an id.
  @Get('search')
  @RequireScope('read')
  @ApiOkResponse({
    type: SearchResultResponse,
    description:
      'Cached for 60s; any product write invalidates. Hits have no version and may be stale: read GET /products/:id before writing',
  })
  @ApiBadRequestResponse({
    description: 'Invalid query: q over 200 characters, page × size over 10000, maxPrice below minPrice, or a bad value',
  })
  @ApiServiceUnavailableResponse({ description: 'search-service is unavailable' })
  search(@Query() query: SearchProductsQuery): Promise<SearchResultResponse> {
    return this.products.search(query);
  }

  @Get(':id')
  @RequireScope('read')
  @ApiOkResponse({
    type: ProductResponse,
    description: 'Served from Redis when cached',
    headers: ETAG_HEADER,
  })
  @ApiBadRequestResponse({ description: 'id is not a UUID' })
  @ApiNotFoundResponse()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withETag(res, await this.products.findOne(id));
  }

  @Patch(':id')
  @RequireScope('write')
  @ApiHeader(IF_MATCH_HEADER)
  @ApiOkResponse({ type: ProductResponse, headers: ETAG_HEADER })
  @ApiBadRequestResponse({ description: 'Invalid or empty body, or a malformed If-Match' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'sku already exists' })
  @ApiPreconditionFailedResponse({
    type: PreconditionFailedResponse,
    description:
      'The product changed since you read it; the body has currentVersion. If you are retrying after a timeout, re-read the product: your first attempt may have succeeded',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withETag(
      res,
      await this.products.update(id, dto, parseIfMatch(ifMatch)),
    );
  }

  @Delete(':id')
  @RequireScope('admin')
  @HttpCode(204)
  @ApiHeader(IF_MATCH_HEADER)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'id is not a UUID, or a malformed If-Match' })
  @ApiNotFoundResponse()
  @ApiPreconditionFailedResponse({
    type: PreconditionFailedResponse,
    description:
      'The product changed since you read it; the body has currentVersion',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    return this.products.remove(id, parseIfMatch(ifMatch));
  }
}
