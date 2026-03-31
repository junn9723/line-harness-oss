import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/node-entry.ts'],
  outDir: 'dist-node',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Bundle workspace packages into the output, but keep native/node modules external
  noExternal: [/@line-crm\/.*/, /^hono/, /^@hono\/.*/],
  external: ['better-sqlite3', 'node-cron'],
  banner: {
    js: `
// Polyfill Cloudflare Workers globals for Node.js
if (typeof globalThis.ScheduledEvent === 'undefined') {
  globalThis.ScheduledEvent = class ScheduledEvent {};
}
if (typeof globalThis.ExecutionContext === 'undefined') {
  globalThis.ExecutionContext = class ExecutionContext {};
}
`,
  },
});
