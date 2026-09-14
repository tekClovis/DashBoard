# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

FROM deps AS build-shared
COPY shared shared
RUN npm run build --workspace shared

FROM build-shared AS build-web
COPY web web
RUN npm run build --workspace web

FROM build-web AS build-server
COPY server server
RUN npm run build --workspace server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --workspace shared
COPY --from=build-shared /app/shared/dist shared/dist
COPY --from=build-server /app/server/dist server/dist
COPY --from=build-server /app/server/prisma server/prisma
COPY --from=build-web /app/web/dist server/public
EXPOSE 8080
CMD ["sh", "-c", "npx --workspace server prisma migrate deploy && node server/dist/main.js"]
