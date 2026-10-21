# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
#  Arena Royale: imágenes de producción.
#   - server (por defecto, la última etapa): servidor de juego + API. Es la que construye Railway.
#   - client (--target client): el cliente estático servido con nginx (para docker compose;
#     en producción el cliente va en Vercel).
#  Los atlas de sprites (client/public/gen) tienen que existir antes de construir el cliente.
# ─────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
# Prisma necesita OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependencias de todo el monorepo (el postinstall genera el cliente de Prisma)
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
COPY server/prisma server/prisma
RUN npm ci --no-audit --no-fund

# ───────────────────────── Cliente ─────────────────────────

FROM deps AS build-client
# URL del servidor de juego (wss://…) y DSN de Sentry opcional: van dentro del build
ARG VITE_SERVER_URL=""
ARG VITE_SENTRY_DSN=""
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
RUN test -f client/public/gen/manifest.json \
  || (echo "Faltan los atlas de sprites en client/public/gen (npm run assets)" && exit 1)
RUN npm run build -w client

FROM nginx:1.27-alpine AS client
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build-client /app/client/dist /usr/share/nginx/html
EXPOSE 8080

# ───────────────────────── Servidor ─────────────────────────

FROM deps AS build-server
COPY tsconfig.base.json ./
COPY tools/build-server.ts tools/
COPY shared shared
COPY server server
RUN npm run build:server

# Solo las dependencias de producción (Prisma incluido: hace falta para `migrate deploy`)
FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund \
  && npx prisma generate --schema server/prisma/schema.prisma

FROM base AS server
ENV NODE_ENV=production \
    PORT=2567
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server/package.json server/
COPY --chown=node:node server/prisma server/prisma
COPY --from=build-server --chown=node:node /app/server/dist server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||2567)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# node directamente (sin npm) para que le llegue el SIGTERM y deje terminar las partidas
CMD ["node", "--enable-source-maps", "server/dist/index.js"]
