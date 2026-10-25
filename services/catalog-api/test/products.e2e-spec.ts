import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient } from 'redis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  type FakeSearchService,
  startFakeSearchService,
} from './fake-search-service';

describe('products (e2e)', () => {
  let app: INestApplication;
  let redis: ReturnType<typeof createClient>;
  let fake: FakeSearchService;

  beforeAll(async () => {
    // Must be set before the module compiles: the config is read then.
    fake = await startFakeSearchService();
    process.env.SEARCH_SERVICE_URL = fake.url;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
    configureApp(app);
    await app.init();

    redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
  });

  afterAll(async () => {
    await redis?.close();
    await app?.close();
    await fake?.close();
  });

  // Every endpoint needs a key (ADR-0020); these tests act as admin, and
  // auth.e2e-spec.ts covers each scope.
  const asAdmin = () =>
    request
      .agent(app.getHttpServer())
      .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`);

  // Unique per run, so the test needs no database reset.
  const body = {
    sku: `E2E-${Date.now()}`,
    name: 'E2E Phone',
    description: 'Created by the e2e test',
    category: 'electronics',
    brand: 'Acme',
    priceCents: 1999900,
    stock: 5,
  };

  it('runs the product lifecycle against search-service, then while it is down', async () => {
    const http = asAdmin();

    const created = await http.post('/products').send(body).expect(201);
    const id: string = created.body.id;
    expect(created.body).toMatchObject({ ...body, currency: 'EGP' });
    expect(fake.calls).toContainEqual({
      method: 'PUT',
      path: `/products/${id}`,
      body: created.body,
    });

    await http.post('/products').send(body).expect(409);

    const first = await http.get(`/products/${id}`).expect(200);
    expect(await redis.exists(`product:${id}`)).toBe(1);
    const second = await http.get(`/products/${id}`).expect(200);
    expect(second.body).toEqual(first.body);

    // Route order: "search" must not be parsed as an :id (that would be 400).
    const searched = await http.get('/products/search?q=phone').expect(200);
    expect(searched.body).toEqual({
      hits: [],
      total: 0,
      facets: { category: [], brand: [], price: [] },
    });

    const versionBefore = Number(await redis.get('search:version'));
    const patched = await http
      .patch(`/products/${id}`)
      .send({ priceCents: 1 })
      .expect(200);
    expect(patched.body.priceCents).toBe(1);
    expect(Number(await redis.get('search:version'))).toBe(versionBefore + 1);
    const afterPatch = await http.get(`/products/${id}`).expect(200);
    expect(afterPatch.body.priceCents).toBe(1);

    await http.get('/products/not-a-uuid').expect(400);
    await http
      .post('/products')
      .send({ ...body, stock: -1 })
      .expect(400);
    await http.patch(`/products/${id}`).send({ name: null }).expect(400);

    const other = await http
      .post('/products')
      .send({ ...body, sku: `${body.sku}-B` })
      .expect(201);
    await http
      .patch(`/products/${id}`)
      .send({ sku: other.body.sku })
      .expect(409);
    await http.delete(`/products/${other.body.id}`).expect(204);
    // Versioned (ADR-0007): later than the deleted row's last upsert.
    const deleteCall = fake.calls.find(
      (c) =>
        c.method === 'DELETE' &&
        c.path.startsWith(`/products/${other.body.id}?`),
    );
    const version = Number(
      new URL(deleteCall?.path ?? '', fake.url).searchParams.get('version'),
    );
    expect(version).toBeGreaterThan(Date.parse(other.body.updatedAt));

    // Alias-swap reindex: start a build, bulk into it, finish (swap).
    const reindexed = await http.post('/admin/reindex').expect(200);
    expect(reindexed.body).toMatchObject({
      indexed: expect.any(Number),
      skipped: 0,
      failed: [],
      swapped: true,
    });
    const reindexCalls = fake.calls.filter((c) =>
      c.path.startsWith('/reindex/'),
    );
    const build = (reindexCalls[1]?.body as { build: string }).build;
    expect(reindexCalls.map((c) => c.path)).toEqual([
      '/reindex/start',
      ...reindexCalls.slice(1, -1).map(() => '/reindex/_bulk'),
      '/reindex/finish',
    ]);
    expect(reindexCalls.length).toBeGreaterThan(2);
    expect(reindexCalls.slice(1).map((c) => c.body)).toEqual(
      reindexCalls.slice(1).map(() => expect.objectContaining({ build })),
    );
    expect(fake.build).toBeUndefined();

    // Another reindex is already running: 409, and ours never touches its build.
    fake.build = 'products-v99';
    const running = await http.post('/admin/reindex').expect(409);
    expect(running.body.message).toBe('a reindex is already running');
    expect(fake.build).toBe('products-v99');
    fake.build = undefined;

    // search-service goes down: writes still succeed, search and reindex say 503.
    fake.status = 503;
    await http.patch(`/products/${id}`).send({ priceCents: 2 }).expect(200);
    // The PATCH bumped the search version, so this misses the cache.
    await http.get('/products/search?q=phone').expect(503);
    await http.post('/admin/reindex').expect(503);
    await http.delete(`/products/${id}`).expect(204);
    expect(await redis.exists(`product:${id}`)).toBe(0);
    await http.get(`/products/${id}`).expect(404);
    await http.get('/readyz').expect(200);
  });

  it('refuses a stale If-Match with 412 and keeps ETag equal to version', async () => {
    const http = asAdmin();
    fake.status = 200; // the lifecycle test leaves it down
    const sku = `E2E-IFM-${Date.now()}`;

    const created = await http
      .post('/products')
      .send({ ...body, sku })
      .expect(201);
    const id: string = created.body.id;
    expect(created.body.version).toBe(1);
    expect(created.headers.etag).toBe('"1"');

    const read = await http.get(`/products/${id}`).expect(200);
    expect(read.headers.etag).toBe('"1"');
    expect(read.body.version).toBe(1);

    const first = await http
      .patch(`/products/${id}`)
      .set('If-Match', '"1"')
      .send({ stock: 2 })
      .expect(200);
    expect(first.body.version).toBe(2);
    expect(first.headers.etag).toBe('"2"');

    // The same write again, from a client that still has version 1.
    const stale = await http
      .patch(`/products/${id}`)
      .set('If-Match', '"1"')
      .send({ stock: 13 })
      .expect(412);
    expect(stale.body).toEqual({
      statusCode: 412,
      message: 'product changed: you sent version 1, current is 2',
      error: 'Precondition Failed',
      currentVersion: 2,
    });
    // Unchanged by the 412, and the cache was invalidated by the 200.
    const afterStale = await http.get(`/products/${id}`).expect(200);
    expect(afterStale.body).toMatchObject({ stock: 2, version: 2 });

    // If-Match stays optional.
    const unconditional = await http
      .patch(`/products/${id}`)
      .send({ stock: 3 })
      .expect(200);
    expect(unconditional.body.version).toBe(3);

    const weak = await http
      .patch(`/products/${id}`)
      .set('If-Match', 'W/"1"')
      .send({ stock: 4 })
      .expect(400);
    expect(weak.body.message).toContain('If-Match must be one strong ETag');

    // A rejected write doesn't use up a version: the same ETag still works.
    const other = await http
      .post('/products')
      .send({ ...body, sku: `${sku}-B` })
      .expect(201);
    await http
      .patch(`/products/${id}`)
      .set('If-Match', '"3"')
      .send({ sku: other.body.sku })
      .expect(409);
    const afterConflict = await http
      .patch(`/products/${id}`)
      .set('If-Match', '"3"')
      .send({ stock: 5 })
      .expect(200);
    expect(afterConflict.body.version).toBe(4);

    await http.get(`/products/${id}`).set('If-None-Match', '"4"').expect(304);

    await http.delete(`/products/${id}`).set('If-Match', '"1"').expect(412);
    await http.get(`/products/${id}`).expect(200);
    await http.delete(`/products/${id}`).set('If-Match', '"4"').expect(204);
    await http.delete(`/products/${id}`).set('If-Match', '"4"').expect(404);
    await http.delete(`/products/${other.body.id}`).expect(204);

    await http
      .patch('/products/0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01')
      .set('If-Match', '"1"')
      .send({ stock: 1 })
      .expect(404);
  });

  it('validates maxStock itself and forwards it with sort=stock_asc', async () => {
    const http = asAdmin();
    fake.status = 200; // the lifecycle test leaves it down

    for (const [bad, message] of [
      ['-1', 'maxStock must be a whole number from 0 to 2147483647'],
      ['abc', 'maxStock must be a whole number from 0 to 2147483647'],
    ]) {
      const res = await http
        .get(`/products/search?maxStock=${bad}`)
        .expect(400);
      expect(res.body.message).toEqual([message]); // one message (5.1 review)
    }

    await http.get('/products/search?maxStock=5&sort=stock_asc').expect(200);
    const forwarded = fake.calls
      .filter((c) => c.method === 'GET' && c.path.startsWith('/search'))
      .map((c) => Object.fromEntries(new URL(c.path, fake.url).searchParams));
    expect(forwarded).toContainEqual({
      maxStock: '5',
      sort: 'stock_asc',
      page: '1',
      size: '20',
    });
  });
});
