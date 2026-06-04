# syntax=docker/dockerfile:1.7
# Multi-stage Nuxt 4 build. Produces /app/.output (nitro node-server preset).

############### deps ########################################################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

############### builder #####################################################
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
ENV NUXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

############### runtime #####################################################
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=8080 \
    NITRO_HOST=0.0.0.0
COPY --from=builder /app/.output ./.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
