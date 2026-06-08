# selfhosted-supabase-mcp в HTTP-режиме для Veloseller.
# Клонирует и собирает HenkDz/selfhosted-supabase-mcp (готового образа на
# Docker Hub нет). Bun-рантайм. Запускается в сети стека supabase_default,
# видит kong:8000 и db:5432 по внутренним именам.
FROM oven/bun:1.1-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
# pin на конкретный коммит можно через --branch; master стабилен для docker/
RUN git clone --depth 1 https://github.com/HenkDz/selfhosted-supabase-mcp.git .
RUN bun install --frozen-lockfile || bun install
RUN bun build src/index.ts --outdir dist --target bun

FROM oven/bun:1.1-alpine
WORKDIR /app
RUN addgroup -S mcp && adduser -S -G mcp mcp
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER mcp
ENV NODE_ENV=production
EXPOSE 3100
# аргументы транспорта — в command compose; ключи — через environment
CMD ["bun", "run", "dist/index.js", "--transport", "http", "--port", "3100", "--host", "0.0.0.0"]
