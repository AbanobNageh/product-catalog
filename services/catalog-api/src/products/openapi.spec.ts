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

  // Search results may be stale, so they carry no version to write with (ADR-0019).
  it('search hits have no version; products do', async () => {
    const schemas = (await document()).components?.schemas as Record<
      string,
      { properties?: Record<string, { items?: { $ref?: string } }> }
    >;
    expect(schemas.ProductResponse.properties).toHaveProperty('version');
    const ref = schemas.SearchResultResponse.properties?.hits.items?.$ref ?? '';
    const hit = schemas[ref.replace('#/components/schemas/', '')];
    expect(hit.properties).toHaveProperty('sku');
    expect(hit.properties).not.toHaveProperty('version');
  });

  describe('optimistic concurrency (ADR-0019)', () => {
    type Op = {
      parameters?: { name: string; in: string; required?: boolean }[];
      responses: Record<string, { description?: string; headers?: object }>;
    };
    const op = async (method: 'get' | 'post' | 'patch' | 'delete') => {
      const paths = (await document()).paths;
      const path = method === 'post' ? '/products' : '/products/{id}';
      return paths[path][method] as Op;
    };

    it.each(['patch', 'delete'] as const)(
      '%s documents an optional If-Match header and a 412',
      async (method) => {
        const o = await op(method);
        expect(o.parameters).toContainEqual(
          expect.objectContaining({
            name: 'If-Match',
            in: 'header',
            required: false,
          }),
        );
        expect(Object.keys(o.responses)).toContain('412');
      },
    );

    it.each([
      ['get', '200'],
      ['post', '201'],
      ['patch', '200'],
    ] as const)('%s documents the ETag header', async (method, status) => {
      expect((await op(method)).responses[status].headers).toHaveProperty(
        'ETag',
      );
    });

    it.each(['patch', 'delete'] as const)(
      '%s documents the 412 body with currentVersion',
      async (method) => {
        const doc = await document();
        const res = (await op(method)).responses['412'] as {
          content?: Record<string, { schema?: { $ref?: string } }>;
        };
        const ref = res.content?.['application/json']?.schema?.$ref ?? '';
        const schema = doc.components?.schemas?.[
          ref.replace('#/components/schemas/', '')
        ] as { properties?: Record<string, { type?: string }> } | undefined;
        expect(schema?.properties?.currentVersion).toMatchObject({
          type: 'integer',
        });
      },
    );

    it('tells a retrying client to re-read the product', async () => {
      expect((await op('patch')).responses['412'].description).toContain(
        're-read',
      );
    });

    it('says search hits may be stale', async () => {
      const search = (await document()).paths['/products/search'].get
        ?.responses['200'] as { description?: string };
      expect(search.description).toContain('GET /products/:id before writing');
    });
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
