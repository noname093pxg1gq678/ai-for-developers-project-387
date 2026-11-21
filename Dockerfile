# Сборка: зависимости и сборка обоих воркспейсов
FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
COPY frontend frontend
RUN npm run build --workspaces

# Рантайм: продовые зависимости бекенда и собранные артефакты.
# Один образ: бекенд раздаёт API и статику фронтенда на одном порту (issue #7).
FROM node:24.22.1-alpine
ENV NODE_ENV=production
ENV STATIC_ROOT=/app/frontend/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev --workspace backend
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
CMD ["node", "backend/dist/index.js"]
