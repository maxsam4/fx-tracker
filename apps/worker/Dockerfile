# Worker image: includes Playwright + chromium for scraping fallbacks.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile=false

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget gnupg \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# node user (uid 1000) ships with the base image — use it to avoid running as root.
RUN mkdir -p /app /home/node/.cache/ms-playwright \
 && chown -R node:node /app /home/node/.cache

# Source FIRST so the COPY can't wipe per-package node_modules layered next.
COPY --chown=node:node pnpm-workspace.yaml package.json ./
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node config ./config
COPY --chown=node:node packages/core ./packages/core
COPY --chown=node:node apps/worker ./apps/worker
# Per-package node_modules from deps stage (pnpm puts .bin symlinks here).
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps --chown=node:node /app/packages/core/node_modules ./packages/core/node_modules

USER node
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
RUN pnpm dlx playwright install chromium

WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
