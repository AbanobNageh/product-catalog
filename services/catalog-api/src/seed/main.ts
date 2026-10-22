import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { generateProducts } from './generate-products';

/**
 * Seed: inserts 10,000 fake products straight into Postgres, then asks the
 * running catalog-api to reindex them (ADR-0006). Re-running it is safe: the
 * SKUs are fixed, so existing rows are skipped. Exits 1 if the reindex fails
 * or reports failed items.
 *
 * Env: DATABASE_URL (required), CATALOG_API_URL (default http://localhost:3000).
 */
const SEED_COUNT = 10_000;
const FAKER_SEED = 2026;
const INSERT_CHUNK = 1000;
/** 20 bulk batches of 500, each up to 15s: generous, but bounded. */
const REINDEX_TIMEOUT_MS = 300_000;

const logger = new ConsoleLogger('Seed', { json: true });

async function seed(): Promise<number> {
  // Same rule as main.ts: a .env file is only for local development.
  if (existsSync('.env')) process.loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error('DATABASE_URL is required');
    return 1;
  }
  const apiUrl = (
    process.env.CATALOG_API_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const products = generateProducts(SEED_COUNT, FAKER_SEED);
  let inserted = 0;
  try {
    for (let i = 0; i < products.length; i += INSERT_CHUNK) {
      const { count } = await prisma.product.createMany({
        data: products.slice(i, i + INSERT_CHUNK),
        skipDuplicates: true,
      });
      inserted += count;
    }
  } finally {
    await prisma.$disconnect();
  }
  logger.log('products inserted', {
    inserted,
    alreadyPresent: SEED_COUNT - inserted,
  });

  logger.log('reindex started', { url: `${apiUrl}/admin/reindex` });
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${apiUrl}/admin/reindex`, {
      method: 'POST',
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    logger.error('reindex request failed', {
      url: `${apiUrl}/admin/reindex`,
      err: String(err),
      cause: cause?.code ?? cause?.message,
    });
    return 1;
  }
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep the raw text
  }
  if (!res.ok) {
    logger.error('reindex failed', { status: res.status, body });
    return 1;
  }
  const result = (typeof body === 'object' && body !== null ? body : {}) as {
    failed?: unknown[];
    swapped?: boolean;
  };
  if (result.failed && result.failed.length > 0) {
    logger.error('reindex finished with failed items', result);
    return 1;
  }
  if (result.swapped === false) {
    logger.error('reindex did not swap', result);
    return 1;
  }
  logger.log('reindex complete', result);
  return 0;
}

seed().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    logger.error('seed failed', { err: String(err) });
    process.exitCode = 1;
  },
);
