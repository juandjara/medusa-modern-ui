# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

# Corepack honors the `packageManager` field in package.json — pnpm version
# is pinned there, not here, so the image stays in sync with local dev.
RUN corepack enable

# Manifest + lockfile + .npmrc first for cache-friendly layers.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build


FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
