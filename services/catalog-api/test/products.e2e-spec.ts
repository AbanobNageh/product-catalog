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
    const http = request(app.getHttpServer());

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
    expect(fake.calls).toContainEqual({
      method: 'DELETE',
      path: `/products/${other.body.id}`,
      body: undefined,
    });

    const reindexed = await http.post('/admin/reindex').expect(200);
    expect(reindexed.body.indexed).toEqual(expect.any(Number));

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
});
