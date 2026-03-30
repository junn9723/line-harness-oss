/**
 * Node.js entry point for Docker/VPS deployment.
 *
 * This file replaces the Cloudflare Workers runtime with:
 * - @hono/node-server for HTTP
 * - better-sqlite3 for D1-compatible database
 * - Local filesystem for R2-compatible storage
 * - node-cron for scheduled tasks
 */

import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { schedule, type ScheduledTask } from 'node-cron';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1Shim } from '@line-crm/db/d1-shim';
import { createFileStorage } from './storage-adapter.js';
import { app, scheduled } from './index.js';
import type { Env } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '8787', 10);
const DB_PATH = process.env.DB_PATH || './data/line-harness.db';
const STORAGE_PATH = process.env.STORAGE_PATH || './data/images';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

// Ensure data directory exists
const dbDir = dirname(resolve(DB_PATH));
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

console.log(`[db] Opening SQLite database at ${resolve(DB_PATH)}`);
const sqlite = new Database(DB_PATH);
const db = createD1Shim(sqlite);

// Run migrations — fail fast if schema not found or invalid
const schemaCandidates = [
  resolve(__dirname, '../../../packages/db/schema.sql'),
  resolve(__dirname, '../../packages/db/schema.sql'),
  './packages/db/schema.sql',
  '/app/packages/db/schema.sql',
];

let schemaApplied = false;
for (const p of schemaCandidates) {
  if (existsSync(p)) {
    console.log(`[db] Applying schema from ${p}`);
    try {
      const schema = readFileSync(p, 'utf-8');
      sqlite.exec(schema);
      console.log('[db] Schema applied successfully');
      schemaApplied = true;
    } catch (err) {
      console.error(`[db] FATAL: Failed to apply schema from ${p}:`, err);
      process.exit(1);
    }
    break;
  }
}
if (!schemaApplied) {
  console.error('[db] FATAL: schema.sql not found in any of:', schemaCandidates);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Storage setup
// ---------------------------------------------------------------------------

console.log(`[storage] Using filesystem storage at ${resolve(STORAGE_PATH)}`);
const storage = createFileStorage(STORAGE_PATH);

// ---------------------------------------------------------------------------
// Environment bindings (emulates Cloudflare Workers env)
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`[env] FATAL: Required environment variable ${key} is not set`);
    process.exit(1);
  }
  return val;
}

const env: Env['Bindings'] = {
  DB: db,
  IMAGES: storage as unknown as R2Bucket,
  LINE_CHANNEL_SECRET: requireEnv('LINE_CHANNEL_SECRET'),
  LINE_CHANNEL_ACCESS_TOKEN: requireEnv('LINE_CHANNEL_ACCESS_TOKEN'),
  API_KEY: requireEnv('API_KEY'),
  LIFF_URL: process.env.LIFF_URL || '',
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || '',
  LINE_LOGIN_CHANNEL_ID: process.env.LINE_LOGIN_CHANNEL_ID || '',
  LINE_LOGIN_CHANNEL_SECRET: process.env.LINE_LOGIN_CHANNEL_SECRET || '',
  WORKER_URL: process.env.WORKER_URL || `http://localhost:${PORT}`,
  X_HARNESS_URL: process.env.X_HARNESS_URL,
};

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

console.log(`[server] Starting LINE Harness on port ${PORT}`);

const server = serve({
  fetch: (request) => app.fetch(request, env),
  port: PORT,
});

console.log(`[server] LINE Harness is running at http://localhost:${PORT}`);

// ---------------------------------------------------------------------------
// Cron scheduler
// ---------------------------------------------------------------------------

console.log(`[cron] Scheduling jobs with pattern: ${CRON_SCHEDULE}`);

const cronTask: ScheduledTask = schedule(CRON_SCHEDULE, async () => {
  const start = Date.now();
  console.log(`[cron] Running scheduled tasks...`);
  try {
    // Create a minimal ScheduledEvent-like object
    const event = { scheduledTime: Date.now(), cron: CRON_SCHEDULE } as ScheduledEvent;
    const ctx = {
      waitUntil: (p: Promise<unknown>) => p.catch((e) => console.error('[cron] waitUntil error:', e)),
      passThroughOnException: () => {},
    } as ExecutionContext;

    await scheduled(event, env, ctx);
    console.log(`[cron] Scheduled tasks completed in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[cron] Scheduled task error:', err);
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('[server] Shutting down...');

  // Stop accepting new cron tasks
  cronTask.stop();

  // Close HTTP server
  server.close(() => {
    console.log('[server] HTTP server closed');
  });

  // Close database
  try {
    sqlite.close();
    console.log('[server] Database closed');
  } catch (err) {
    console.error('[server] Error closing database:', err);
  }

  // Force exit after timeout if graceful shutdown hangs
  setTimeout(() => {
    console.error('[server] Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
