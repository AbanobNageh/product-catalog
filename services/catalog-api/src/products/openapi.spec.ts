import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AdminController } from './admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

// The OpenAPI document is the contract (.claude/rules/services.md): every
// status an endpoint can return must be in it.
describe('OpenAPI document', () => {
  const responses = async (path: string, method: 'get' | 'post') => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController, AdminController],
      providers: [{ provide: ProductsService, useValue: {} }],
    }).compile();
    const app = moduleRef.createNestApplication();
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    await app.close();
    return Object.keys(doc.paths[path][method]?.responses ?? {});
  };

  it('documents the search validation 400 alongside 200 and 503', async () => {
    expect(await responses('/products/search', 'get')).toEqual(
      expect.arrayContaining(['200', '400', '503']),
    );
  });

  it('documents the reindex 500 for failures that are not search-service', async () => {
    expect(await responses('/admin/reindex', 'post')).toEqual(
      expect.arrayContaining(['200', '500', '503']),
    );
  });
});
