FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS web-build

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=web-build /app/dist ./dist
COPY src ./src
COPY data/artifacts/runtime/regulatory.sqlite ./data/artifacts/runtime/regulatory.sqlite

EXPOSE 8080

CMD ["node", "--import", "tsx", "src/server/index.ts"]
