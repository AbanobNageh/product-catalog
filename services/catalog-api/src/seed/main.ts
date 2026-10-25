import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { generateProducts } from './generate-products';
import { callReindex, readSeedEnv } from './reindex-call';

/**
 * Seed: inserts 10,000 fake products straight into Postgres, then asks the
 * running catalog-api to reindex them (ADR-0006). Re-running it is safe: the
 * SKUs are fixed, so existing rows are skipped. Exits 1 if the reindex fails
 * or reports failed items.
 *
 * Env: DATABASE_URL (required), CATALOG_API_KEY (required: the admin API key,
 * ADR-0020), CATALOG_API_URL (default http://localhost:3000).
 */
const SEED_COUNT = 10_000;
const FAKER_SEED = 2026;
const INSERT_CHUNK = 1000;

const logger = new ConsoleLogger('Seed', { json: true });

async function seed(): Promise<number> {
  // Same rule as main.ts: a .env file is only for local development.
  if (existsSync('.env')) process.loadEnvFile();
  // Checked before anything is inserted.
  const { config, errors } = readSeedEnv(process.env);
  if (!config) {
    for (const error of errors) logger.error(error);
    return 1;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl }),
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

  logger.log('reindex started', { url: `${config.apiUrl}/admin/reindex` });
  const outcome = await callReindex(config.apiUrl, config.apiKey);
  if (!outcome.ok) {
    logger.error(outcome.error, outcome.details);
    return 1;
  }
  logger.log('reindex complete', outcome.result);
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
