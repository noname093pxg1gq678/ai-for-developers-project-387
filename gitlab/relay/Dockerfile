# Вебхук-релей агент-контура self-hosted GitLab (тикет #15). Отдельный сервис,
# не workspace корня: слушает webhooks, применяет guard-фильтры, запускает
# пайплайн агента. Конфигурация - окружением:
#   WEBHOOK_SECRET - секрет вебхука GitLab (совпадение с X-Gitlab-Token)
#   GITLAB_URL     - адрес инстанса, например https://gitlab.example.com
#   GITLAB_TOKEN   - project access token релея, scope api
#   PORT           - порт слушателя (по умолчанию 8080)

FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "dist/index.js"]
