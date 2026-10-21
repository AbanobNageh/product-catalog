import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { AdminController } from './admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [SearchModule],
  controllers: [ProductsController, AdminController],
  providers: [ProductsService],
})
export class ProductsModule {}
