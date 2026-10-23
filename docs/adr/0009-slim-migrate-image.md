# 0009. A slim `migrate` image for database migrations

- **Status:** Proposed (chosen by the user at the K3 start)
- **Date:** 2026-10-23

## Context
- ADR-0003 chose Prisma and runs migrations as a pre-rollout Kubernetes Job (K3), never at app startup. It left the Job's image open: the runtime image has no Prisma CLI.
- Until now Compose's `migrate` service used the Dockerfile's `build` stage: about 1.3 GB, with dev dependencies (Jest, the Nest CLI, oxlint) and the source code.
- `prisma migrate deploy` needs the `prisma` CLI and `@prisma/engines` (whose install script downloads the schema engine binary), `prisma.config.ts`, `prisma/` and `DATABASE_URL`. It doesn't need the app's code or its other dependencies.

## Options
1. **The `build` stage, tagged as the migration image.** No Dockerfile change, but it's the largest option, and it ships dev tools and source code to the cluster.
2. **A slim `migrate` stage** in the same Dockerfile, holding only the Prisma CLI, the schema and the migrations. Chosen.
3. **The Prisma CLI in the runtime image**, so one image runs both the app and the Job. App and migrations can't drift apart, but the runtime image carries about 250 MB of CLI it never uses, and `npm ci` would need its install scripts.

## Decision
- Add a `migrate` stage (stage 3; `runtime` stays last, so a plain `docker build` still produces the app image).
- Its `package.json` is cut down at build time to the single `prisma` dependency, at the version in the real `package.json`. `npm install` then takes every other version from the existing lockfile, so there's no second lockfile to maintain.
- It runs as the `node` user, with the default command `npx prisma migrate deploy`.
- Tag it like the app (`catalog-api-migrate:<version>`) and build both from the same commit, so the migrations always match the app version they belong to.
- Compose's `migrate` service builds the same stage.

## Consequences
- Measured at the K3 start: about 615 MB on Docker Desktop (the `node:24-alpine` base is about 245 MB), against about 1.3 GB for the `build` stage. `node_modules` is 256 MB, almost all of it the Prisma CLI. An earlier attempt without `npm cache clean --force` was over 1 GB, because npm's download cache stayed in the layer.
- It was tested against a throwaway Postgres 18 as the `node` user: it applied `20261021100029_init`, and a second run reported "No pending migrations to apply".
- There are two images per version to build and load into kind.
- `npm install` (not `npm ci`) is used in this stage, because the cut-down `package.json` no longer matches the lockfile's root entry. It still keeps the locked versions of everything it installs.
