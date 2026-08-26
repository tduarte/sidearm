# Panel image: Next.js 16 App Router + custom server (server.ts) on ws.
# Runs the TypeScript entrypoint directly via `tsx` — keeps the custom
# server path that Next's `standalone` output can't trace.
#
# Build: docker build -t sidearm-panel .
# Run:   orchestrated by docker-compose.yml

# ---- deps ---------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
# better-sqlite3 publishes no musl prebuild, so it is compiled from source here
# — that needs a toolchain. Without these, `npm ci` fails on alpine.
RUN apk add --no-cache libc6-compat python3 make g++
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
    BIND_HOST=0.0.0.0

# Drop root for the running process.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs sidearm

# Ship the compiled app + required source (server.ts / lib / app / components
# / hooks / public) + production deps. `tsx` is a runtime TypeScript loader;
# we stay with it rather than pre-compiling because the custom server also
# imports `./lib/**/*.ts` directly.
COPY --from=deps  --chown=sidearm:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=sidearm:nodejs /app/.next         ./.next
COPY --from=build --chown=sidearm:nodejs /app/public        ./public
COPY --from=build --chown=sidearm:nodejs /app/app           ./app
COPY --from=build --chown=sidearm:nodejs /app/components    ./components
COPY --from=build --chown=sidearm:nodejs /app/hooks         ./hooks
COPY --from=build --chown=sidearm:nodejs /app/lib           ./lib
COPY --from=build --chown=sidearm:nodejs /app/server.ts        ./server.ts
COPY --from=build --chown=sidearm:nodejs /app/next.config.ts   ./next.config.ts
COPY --from=build --chown=sidearm:nodejs /app/tsconfig.json    ./tsconfig.json
COPY --from=build --chown=sidearm:nodejs /app/package.json     ./package.json
COPY --from=build --chown=sidearm:nodejs /app/package-lock.json ./package-lock.json

# /data holds the SQLite DB (Phase E); create it so the non-root user can write.
#
# Deliberately NOT `chown -R ... /app`: on overlayfs every ownership change
# forces a copy-up, so recursing through node_modules rewrites the entire
# dependency tree file-by-file. That measured 607s on a ZFS-backed
# unprivileged LXC. The COPY --chown flags above set ownership as the layers
# are written, which costs nothing.
RUN mkdir -p /data && chown sidearm:nodejs /data /app

USER sidearm
EXPOSE 3000

CMD ["npx", "--yes", "tsx", "server.ts"]
