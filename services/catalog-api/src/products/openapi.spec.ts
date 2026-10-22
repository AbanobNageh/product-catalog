import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AdminController } from './admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

// The OpenAPI document is the contract (.claude/rules/services.md): every
// status an endpoint can return must be in it.
describe('OpenAPI document', () => {
  const document = async () => {
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
    return doc;
  };

  const responses = async (path: string, method: 'get' | 'post') =>
    Object.keys((await document()).paths[path][method]?.responses ?? {});

  it('documents the search validation 400 alongside 200 and 503', async () => {
    expect(await responses('/products/search', 'get')).toEqual(
      expect.arrayContaining(['200', '400', '503']),
    );
  });

  it('documents the reindex 409 and 500 alongside 200 and 503', async () => {
    expect(await responses('/admin/reindex', 'post')).toEqual(
      expect.arrayContaining(['200', '409', '500', '503']),
    );
  });

  it('says a reindex 503 may already have swapped and is safe to rerun', async () => {
    const res = (await document()).paths['/admin/reindex'].post?.responses[
      '503'
    ] as { description?: string };
    expect(res.description).toContain('may already have swapped');
    expect(res.description).toContain('running it again is safe');
  });

  it('documents whether the reindex swapped', async () => {
    const schema = (await document()).components?.schemas?.ReindexResponse as {
      required?: string[];
      properties?: Record<string, { type?: string; description?: string }>;
    };
    expect(schema.required).toContain('swapped');
    expect(schema.properties?.swapped).toMatchObject({
      type: 'boolean',
      description: 'false when items failed; the old index is still live',
    });
  });
});
