import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { ProductPage, ProductResponse } from './dto/product.response';
import { SearchProductsQuery } from './dto/search-products.query';
import { SearchResultResponse } from './dto/search-result.response';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiConflictResponse({ description: 'sku already exists' })
  create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.products.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: ProductPage })
  list(@Query() query: ListProductsQuery): Promise<ProductPage> {
    return this.products.list(query);
  }

  // Declared before ':id' so "search" isn't treated as an id.
  @Get('search')
  @ApiOkResponse({ type: SearchResultResponse, description: 'Cached for 60s; any product write invalidates' })
  @ApiBadRequestResponse({
    description: 'Invalid query: q over 200 characters, page × size over 10000, maxPrice below minPrice, or a bad value',
  })
  @ApiServiceUnavailableResponse({ description: 'search-service is unavailable' })
  search(@Query() query: SearchProductsQuery): Promise<SearchResultResponse> {
    return this.products.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductResponse, description: 'Served from Redis when cached' })
  @ApiBadRequestResponse({ description: 'id is not a UUID' })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProductResponse })
  @ApiBadRequestResponse({ description: 'Invalid or empty body' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'sku already exists' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.products.remove(id);
  }
}
