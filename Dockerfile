# Panel image: Next.js 16 App Router + custom server (server.ts) on ws.
# Runs the TypeScript entrypoint directly via `tsx` — keeps the custom
# server path that Next's `standalone` output can't trace.
#
# Build: docker build -t sidearm-panel .
# Run:   orchestrated by docker-compose.yml

# ---- deps ---------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build --------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Drop root for the running process.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs sidearm

# Ship the compiled app + required source (server.ts / lib / app / components
# / hooks / public) + production deps. `tsx` is a runtime TypeScript loader;
# we stay with it rather than pre-compiling because the custom server also
# imports `./lib/**/*.ts` directly.
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/.next         ./.next
COPY --from=build /app/public        ./public
COPY --from=build /app/app           ./app
COPY --from=build /app/components    ./components
COPY --from=build /app/hooks         ./hooks
COPY --from=build /app/lib           ./lib
COPY --from=build /app/server.ts        ./server.ts
COPY --from=build /app/next.config.ts   ./next.config.ts
COPY --from=build /app/tsconfig.json    ./tsconfig.json
COPY --from=build /app/package.json     ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

# /data holds the SQLite DB (Phase E); create it so the non-root user can write.
RUN mkdir -p /data && chown -R sidearm:nodejs /data /app

USER sidearm
EXPOSE 3000

CMD ["npx", "--yes", "tsx", "server.ts"]
