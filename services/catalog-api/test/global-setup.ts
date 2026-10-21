import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTestEnv } from './load-test-env';

/**
 * Runs once before the e2e suite. Applies migrations to the test database.
 * Nothing is reset or truncated: tests use unique data and clean up after
 * themselves, so the setup never destroys anything.
 */
export default function globalSetup(): void {
  const { databaseUrl } = loadTestEnv();
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
