import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const root = join(__dirname, '..');

/**
 * Loads .env.test (or the committed .env.test.example) and refuses to go on
 * unless DATABASE_URL points at a database whose name ends in _test, so the
 * tests can never write to the dev database.
 */
export function loadTestEnv(): { databaseUrl: string; redisUrl: string } {
  const file = ['.env.test', '.env.test.example']
    .map((name) => join(root, name))
    .find((path) => existsSync(path));
  if (!file) throw new Error('e2e: no .env.test or .env.test.example found');

  // Assign explicitly so test values win over the shell, and because Jest
  // gives test files a copy of process.env that process.loadEnvFile() can't reach.
  Object.assign(process.env, parseEnv(readFileSync(file, 'utf8')));

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const redisUrl = process.env.REDIS_URL ?? '';
  const dbName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : '';
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `e2e: refusing to run against database "${dbName}". Its name must end in _test.`,
    );
  }
  return { databaseUrl, redisUrl };
}
