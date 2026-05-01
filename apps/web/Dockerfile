# Web image: Next.js standalone output for a minimal runtime.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false

FROM base AS build
# Source FIRST, then layer node_modules from deps on top (so source COPY can't
# wipe the per-package node_modules).
COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY config ./config
COPY packages/core ./packages/core
COPY apps/web ./apps/web
# pnpm workspaces install per-package node_modules with .bin symlinks. Next's
# binary lives at apps/web/node_modules/.bin/next, NOT in the root.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
WORKDIR /app/apps/web
RUN pnpm exec next build

FROM base AS runtime
RUN useradd --system --uid 1001 --create-home nextjs
RUN mkdir -p /app && chown -R nextjs:nextjs /app

COPY --from=build --chown=nextjs:nextjs /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nextjs /app/packages ./packages
COPY --from=build --chown=nextjs:nextjs /app/apps ./apps
COPY --from=build --chown=nextjs:nextjs /app/tsconfig.base.json ./
COPY --from=build --chown=nextjs:nextjs /app/config ./config

USER nextjs
WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
