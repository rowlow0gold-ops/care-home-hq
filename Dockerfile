# syntax=docker/dockerfile:1.7
# Multi-stage Nuxt 4 build. Produces /app/.output (nitro node-server preset).

############### deps ########################################################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Pin pnpm explicitly — corepack's auto-pick can no-op silently otherwise.
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

############### builder #####################################################
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9
ENV NUXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build && test -d .output/server || { echo "Nuxt build did not produce .output/server"; exit 1; }

############### runtime #####################################################
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=8080 \
    NITRO_HOST=0.0.0.0
COPY --from=builder /app/.output ./.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
