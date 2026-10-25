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

  it('validates maxStock itself and forwards it with sort=stock_asc', async () => {
    const http = request(app.getHttpServer());
    fake.status = 200; // the lifecycle test leaves it down

    for (const [bad, message] of [
      ['-1', 'maxStock must not be less than 0'],
      ['abc', 'maxStock must be an integer number'],
    ]) {
      const res = await http
        .get(`/products/search?maxStock=${bad}`)
        .expect(400);
      expect(res.body.message).toContain(message);
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
