/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output emits a self-contained server.js + minimal node_modules
  // under .next/standalone — runtime image becomes much smaller and starts in
  // ~80ms instead of pnpm-start latency.
  output: 'standalone',
  experimental: {
    // Allow importing from workspace packages without pre-build.
    externalDir: true,
  },
  webpack(config) {
    // Defer heavy server-only deps that the worker uses (Playwright) — never
    // bundled into the web app.
    config.externals = [...(config.externals ?? []), 'playwright', 'playwright-extra'];

    // packages/core uses ESM-style ".js" extensions on TypeScript imports
    // (e.g. `export * from './schema.js'`). Webpack needs this alias to
    // resolve those to the actual .ts source.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
