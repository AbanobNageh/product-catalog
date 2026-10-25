import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  type FakeSearchService,
  startFakeSearchService,
} from './fake-search-service';

// ADR-0020: each scope on each endpoint group, through the real app.
describe('API keys (e2e)', () => {
  let app: INestApplication;
  let fake: FakeSearchService;
  const key = {
    read: process.env.READ_API_KEY ?? '',
    write: process.env.WRITE_API_KEY ?? '',
    admin: process.env.ADMIN_API_KEY ?? '',
  };
  const bearer = (scope: keyof typeof key) => `Bearer ${key[scope]}`;

  beforeAll(async () => {
    fake = await startFakeSearchService();
    process.env.SEARCH_SERVICE_URL = fake.url;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: ['error'] });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await fake?.close();
  });

  const http = () => request(app.getHttpServer());

  it('has the three keys from .env.test(.example)', () => {
    expect(Object.values(key).every((k) => k.length >= 32)).toBe(true);
  });

  it('answers a request without a key with 401 and WWW-Authenticate: Bearer', async () => {
    const res = await http().get('/products').expect(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body.message).toBe(
      'a valid API key is required: Authorization: Bearer <key>',
    );
    await http()
      .get('/products')
      .set('Authorization', 'Bearer not-a-key-but-long-enough-00000000000')
      .expect(401);
  });

  it('refuses the read key on PATCH, naming write', async () => {
    const res = await http()
      .patch('/products/0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01')
      .set('Authorization', bearer('read'))
      .send({ stock: 1 })
      .expect(403);
    expect(res.body.message).toBe(
      'this endpoint needs the write scope; your key has read',
    );
  });

  it('refuses the write key on DELETE and reindex, naming admin', async () => {
    const del = await http()
      .delete('/products/0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01')
      .set('Authorization', bearer('write'))
      .expect(403);
    expect(del.body.message).toBe(
      'this endpoint needs the admin scope; your key has write',
    );
    await http()
      .post('/admin/reindex')
      .set('Authorization', bearer('write'))
      .expect(403);
  });

  it('lets each scope use its own endpoints', async () => {
    fake.status = 200;
    await http()
      .get('/products')
      .set('Authorization', bearer('read'))
      .expect(200);
    await http()
      .get('/products/search?q=phone')
      .set('Authorization', bearer('read'))
      .expect(200);

    const created = await http()
      .post('/products')
      .set('Authorization', bearer('write'))
      .send({
        sku: `E2E-AUTH-${Date.now()}`,
        name: 'E2E Auth Phone',
        description: 'Created by the auth e2e test',
        category: 'electronics',
        brand: 'Acme',
        priceCents: 100,
        stock: 1,
      })
      .expect(201);
    const id: string = created.body.id;
    await http()
      .get(`/products/${id}`)
      .set('Authorization', bearer('read'))
      .expect(200);
    await http()
      .patch(`/products/${id}`)
      .set('Authorization', bearer('write'))
      .send({ stock: 2 })
      .expect(200);
    await http()
      .delete(`/products/${id}`)
      .set('Authorization', bearer('admin'))
      .expect(204);
    await http()
      .post('/admin/reindex')
      .set('Authorization', bearer('admin'))
      .expect(200);
  });

  it('leaves the health checks and Swagger open', async () => {
    await http().get('/healthz').expect(200);
    await http().get('/readyz').expect(200);
    await http().get('/docs-json').expect(200);
  });
});
