import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Same rule as main.ts: a .env file is only for local development.
if (existsSync('.env')) process.loadEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
