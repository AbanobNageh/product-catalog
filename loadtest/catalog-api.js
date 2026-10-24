// k6 load test for catalog-api through Traefik (K6: watch the HPA scale).
// Run from the repo root: k6 run loadtest/catalog-api.js
//
// GET /products is listed straight from Postgres with no cache, so every request
// costs catalog-api CPU (query, mapping, JSON). Cached routes would mostly hit Redis.

import http from 'k6/http';
import { check, sleep } from 'k6';

// 127.0.0.1 plus a Host header: kind maps only the IPv4 port 80, and Traefik routes by Host.
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1';
const HOST = __ENV.HOST || 'catalog.localhost';

export const options = {
  // VUs = virtual users, each looping over default() as fast as its responses allow.
  stages: [
    { duration: '1m', target: 50 }, // ramp up
    { duration: '4m', target: 50 }, // hold: long enough for the HPA to react and settle
    { duration: '30s', target: 0 }, // ramp down
  ],
  // The run fails (exit code 99) if these are broken.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  // 10,000 products / 100 per page = 100 pages.
  const page = Math.floor(Math.random() * 100) + 1;
  const res = http.get(`${BASE_URL}/products?page=${page}&limit=100`, {
    headers: { Host: HOST },
    tags: { name: 'GET /products' },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.1);
}
