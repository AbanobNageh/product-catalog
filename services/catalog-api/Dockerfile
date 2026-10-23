# syntax=docker/dockerfile:1

# 1. Build: all dependencies, generate the Prisma client, compile TypeScript.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

# 2. Production dependencies only. --omit=optional is needed too: the Prisma
#    CLI and TypeScript are optional peers of @prisma/client, so the lockfile
#    marks them (and their ~300 MB of dependencies) "devOptional", which
#    --omit=dev alone keeps. The only production optional dependency is
#    pg-cloudflare, which Node doesn't use. No install scripts are needed at
#    runtime (the approved ones belong to the Prisma CLI).
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# 3. Migrations (ADR-0009): only the Prisma CLI, the schema and the migrations,
#    for Compose's migrate service and the K3 migration Job. Build it with
#    --target migrate. package.json is cut down to the prisma dependency, so the
#    CLI version still comes from package.json and npm install takes every
#    other version from the lockfile. Install scripts run: @prisma/engines
#    downloads the schema engine (approved in allowScripts).
FROM node:24-alpine AS migrate
WORKDIR /app
COPY package.json package-lock.json ./
RUN PRISMA_VERSION=$(npm pkg get devDependencies.prisma | tr -d '"') \
 && npm pkg delete dependencies devDependencies scripts \
 && npm pkg set "dependencies.prisma=$PRISMA_VERSION" \
 && npm install --no-audit --no-fund \
 && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# 4. Runtime: compiled app + production node_modules, as the non-root node user.
#    Migrations never run from this image (see the migrate stage). This stage
#    must stay last: it's what a build without --target produces.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
# Exec form: node is PID 1 and receives SIGTERM directly.
CMD ["node", "dist/main.js"]
