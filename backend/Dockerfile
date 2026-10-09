# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# Prisma reads its config at generate time; a dummy URL is enough (no connection).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
# RapiDoc bundle (B5) served by the API at /api/docs/rapidoc-min.js.
COPY public ./public

RUN npx prisma generate \
    && npm run build

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Schema + migrations are needed to run `migrate deploy` / `db seed` on boot.
COPY --from=build /app/prisma ./prisma

# The seed script is TypeScript and imports the generated Prisma client from
# src/, so the sources are required to run `prisma db seed` inside the container.
COPY --from=build /app/src ./src
COPY --from=build /app/prisma7.config.ts ./
COPY --from=build /app/dist ./dist
# Static assets of the API (RapiDoc bundle for /api/docs).
COPY --from=build /app/public ./public

EXPOSE 4000

# Apply pending migrations, seed the initial data (D1) and start the API.
# The seed is idempotent (upserts) and must never block the boot: if it fails,
# the API still starts and the news sync repopulates the table anyway.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || echo 'seed skipped') && exec node dist/index.js"]