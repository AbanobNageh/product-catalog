# 0003. Prisma as the ORM for catalog-api

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
catalog-api (NestJS 11, TypeScript) needs an ORM or query layer for one `products` table. It needs strong typing, and migrations that run as a **separate command**: a Kubernetes Job in Part 2, never at app startup. I've used Sequelize before, not Prisma.

## Considered options
1. **Prisma:** schema-first (`schema.prisma`), generated types, `migrate dev`/`migrate deploy`.
2. **Sequelize** (+ `sequelize-typescript`): familiar to me, official `@nestjs/sequelize`. Its TypeScript support was added on top, migrations are hand-written, and v7 has been in alpha for years.
3. **TypeORM:** official `@nestjs/typeorm`, decorator style that fits Nest. Its query results are typed more loosely, and it had a long maintenance slump.
4. **Drizzle:** TypeScript-first, SQL-like, strong types, light images, no official Nest module.
5. **MikroORM:** strong typing, unit-of-work style. Overkill for one table.

## Decision
**Prisma.** It has the strongest generated types, and `schema.prisma` is easy to review. `prisma migrate deploy` is idempotent and maps cleanly onto a pre-rollout Kubernetes Job (K3). Drizzle was the runner-up.

## Consequences
- I learn a new tool on the app side. That's acceptable because the AI writes Part 1 and I review it.
- Recent Prisma majors changed the setup: the `prisma-client` generator with an explicit output path, `prisma.config.ts`, and a driver adapter (`@prisma/adapter-pg`) instead of the Rust engine. Milestone 1.2 must follow the current docs and verify this, not older tutorials.
- The migration Job image needs the Prisma CLI, which conflicts with a production-only `node:24-alpine` runtime image. We'll resolve it in 1.2 or K3 (`prisma` as a runtime dependency, or a separate migrate stage or image).
