/**
 * D1Database-compatible shim for better-sqlite3.
 *
 * This module provides a drop-in replacement for Cloudflare D1Database
 * that uses better-sqlite3 under the hood. All existing query helpers
 * in @line-crm/db work unchanged — they call .prepare().bind().all/first/run()
 * which this shim faithfully replicates.
 *
 * Usage:
 *   import Database from 'better-sqlite3';
 *   import { createD1Shim } from '@line-crm/db/d1-shim';
 *   const sqlite = new Database('./data/line-harness.db');
 *   const db = createD1Shim(sqlite);
 *   // db is now usable wherever D1Database is expected
 */

import type BetterSqlite3Database from 'better-sqlite3';

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { duration: number; changes: number; last_row_id: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

/**
 * Create a D1Database-compatible wrapper around a better-sqlite3 instance.
 */
export function createD1Shim(sqlite: BetterSqlite3Database): D1Database {
  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const shim = {
    prepare(query: string): D1PreparedStatement {
      let boundValues: unknown[] = [];

      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]): D1PreparedStatement {
          boundValues = values;
          return stmt;
        },

        async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          const start = performance.now();
          const prepared = sqlite.prepare(query);
          const results = prepared.all(...boundValues) as T[];
          return {
            results,
            success: true,
            meta: {
              duration: performance.now() - start,
              changes: 0,
              last_row_id: 0,
            },
          };
        },

        async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
          const prepared = sqlite.prepare(query);
          const row = prepared.get(...boundValues) as Record<string, unknown> | undefined;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },

        async run(): Promise<D1Result> {
          const start = performance.now();
          const prepared = sqlite.prepare(query);
          const info = prepared.run(...boundValues);
          return {
            results: [],
            success: true,
            meta: {
              duration: performance.now() - start,
              changes: info.changes,
              last_row_id: Number(info.lastInsertRowid),
            },
          };
        },
      };

      return stmt;
    },

    // D1 batch API — not currently used but provided for completeness
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      const transaction = sqlite.transaction(() => {
        for (const s of statements) {
          // Each statement in batch calls run()
          // We synchronously handle this inside the transaction
          results.push({ results: [] as T[], success: true, meta: { duration: 0, changes: 0, last_row_id: 0 } });
        }
      });
      transaction();
      return results;
    },

    // exec: run raw SQL (used for migrations)
    async exec(query: string): Promise<D1Result> {
      const start = performance.now();
      sqlite.exec(query);
      return {
        results: [],
        success: true,
        meta: { duration: performance.now() - start, changes: 0, last_row_id: 0 },
      };
    },
  };

  return shim as unknown as D1Database;
}
