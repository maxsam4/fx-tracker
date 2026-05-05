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
# Persist pnpm's content-addressed store across builds. Tarballs are downloaded
# once, then hardlinked into per-build node_modules — install becomes warm in seconds.
RUN --mount=type=cache,id=pnpm-store-fxweb,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false

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
# BuildKit cache mount keeps Next's incremental cache across rebuilds.
RUN --mount=type=cache,target=/app/apps/web/.next/cache,uid=0,gid=0 \
    pnpm exec next build

# Standalone runtime — Next emits a self-contained tree at
# `apps/web/.next/standalone/` containing only the modules the server actually
# requires. Combined with the static assets it's the smallest possible image.
FROM base AS runtime
RUN useradd --system --uid 1001 --create-home nextjs
RUN mkdir -p /app && chown -R nextjs:nextjs /app

# Standalone tree is rooted at the workspace (because outputFileTracingRoot
# points at ../../). Copying it to /app gives us /app/apps/web/server.js plus
# trimmed-down node_modules and any traced workspace deps.
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
# Static assets aren't traced by the standalone bundle — they live in
# .next/static and (if present) public/.
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
# Provider config is read at runtime by the API routes.
COPY --from=build --chown=nextjs:nextjs /app/config ./config

USER nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
