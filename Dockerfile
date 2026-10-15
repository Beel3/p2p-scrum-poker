# Сборка и запуск: docker compose up -d --build
# Стадия 1: зависимости (кешируются, пока не меняются манифесты).
FROM node:24-alpine AS build
WORKDIR /app

# npm workspaces требуют все манифесты до установки.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# postinstall собирает @scrum-poker/shared, поэтому исходник копируем заранее.
COPY packages/shared/src packages/shared/src
RUN npm ci

# Стадия 2: полная копия исходников и сборка трёх пакетов.
COPY . .
RUN npm run build

# Стадия 3: production-зависимости без dev-пакетов.
FROM node:24-alpine AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

# Стадия 4: минимальный рантайм.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

RUN addgroup -S app && adduser -S app -G app

COPY --from=proddeps --chown=app:app /app/node_modules ./node_modules
COPY --from=build  --chown=app:app /app/package.json ./package.json
COPY --from=build  --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=build  --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build  --chown=app:app /app/apps/server/dist ./apps/server/dist
COPY --from=build  --chown=app:app /app/apps/server/package.json ./apps/server/package.json
COPY --from=build  --chown=app:app /app/apps/web/dist ./apps/web/dist

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
