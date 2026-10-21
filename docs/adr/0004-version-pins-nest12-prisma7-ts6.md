# 0004. Version pins for catalog-api: NestJS 12, Prisma 7, TypeScript 6

- **Status:** Accepted (approved at the 1.2 close)
- **Date:** 2026-10-21

## Context
When planning 1.2, the npm registry no longer matched the spec and ADR-0003:
- **NestJS 12.0.0 shipped on 2026-08-27**, and 12.2.0 is current. 11.x is now on the `legacy` dist-tag. The spec said "NestJS 11". Nest 12 packages are ESM-only, but CommonJS apps keep working through Node's `require(esm)`. Jest 30 can load them on Node ≥ 24.9 (we run 24.21). The Express adapter now drains in-flight requests on shutdown, and the old Terminus health-indicator API is gone.
- **Prisma 8 is a release candidate** (GA "expected October 2026"). It replaces `schema.prisma` and `migrate deploy` with emitted contracts and graph-based `migration plan` / `migrate --yes`. npm's `latest` tag for the `prisma` CLI already points at `8.0.0-rc.24`, while `@prisma/client` `latest` is 7.10.1, so an unpinned `npm i -D prisma` installs a mismatched RC. Prisma's docs also default to v8.
- **TypeScript 7.0** (the native port) is npm `latest`, but `@nestjs/swagger` 12 declares peer support for `^5.5 || ^6` only.
- Drizzle, ADR-0003's runner-up, is also between majors (1.0 RC, `latest` 0.45), so switching ORMs wouldn't avoid the churn.

## Considered options
1. **Current stable majors, pinned exactly:** NestJS 12 (CommonJS + Jest), Prisma 7.10.1, TypeScript 6.0.3.
2. **Newest everything:** NestJS 12 as ESM + Vitest, Prisma 8 RC, TypeScript 7.
3. **Keep the spec's NestJS 11.**

## Decision
**Option 1.** Use current, supported majors, and avoid release candidates and versions the ecosystem doesn't support yet. CommonJS keeps Prisma's generated client, Jest and the Nest CLI on their simplest, best-documented path. `prisma`, `@prisma/client` and `@prisma/adapter-pg` are pinned to the same exact version (`--save-exact`). ADR-0003 (Prisma, `migrate deploy` as a Kubernetes Job) stands unchanged. `docs/plan/app.md` is updated from "NestJS 11" to "NestJS 12".

## Consequences
- Good: everything is stable and documented. ADR-0003's migration-Job reasoning still holds for K3.
- Bad: Prisma 7 will become the previous major soon after 1.2. Moving to 8 changes the migration workflow, so it's a separate, later decision with its own ADR, not drift.
- Bad: Prisma's v7 docs now live under `/docs/v7/` and `/docs/orm/v7/`. Tutorials written for 8 won't apply, and tutorials for Prisma ≤ 6 (Rust engine, `prisma-client-js`, no `prisma.config.ts`) don't apply either.
- Bad (found while scaffolding): `nest new` 12 scaffolds ESM + Vitest without asking, so the CommonJS + Jest setup was converted by hand. Jest loads the ESM-only Nest 12 packages only with Node's `--experimental-vm-modules` flag, which the Nest migration guide doesn't mention. `npm test` passes the flag.
- Upgrading to ESM, TypeScript 7 or Prisma 8 is revisited once their ecosystems settle, not before 1.5.

## Revisit when
Prisma 8 reaches GA and has a documented `migrate deploy`-style command suitable for a Kubernetes Job, or `@nestjs/swagger` supports TypeScript 7.
