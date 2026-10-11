FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev

FROM dependencies AS web-build

COPY index.html tsconfig.json vite.config.ts ./
COPY data/earth/display-tags.json data/earth/source-scope.json ./data/earth/
COPY data/earth/universes ./data/earth/universes
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=web-build /app/dist ./dist
COPY src ./src
COPY data/artifacts/runtime/regulatory.sqlite ./data/artifacts/runtime/regulatory.sqlite
COPY data/artifacts/earth/earth.sqlite ./data/artifacts/earth/earth.sqlite
COPY data/artifacts/earth/graph.json ./data/artifacts/earth/graph.json
COPY data/monitor ./data/monitor

EXPOSE 8080

CMD ["node", "--import", "tsx", "src/server/index.ts"]
