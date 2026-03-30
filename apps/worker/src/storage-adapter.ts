/**
 * Filesystem-based R2Bucket-compatible storage adapter.
 *
 * Provides the same interface as Cloudflare R2 but stores files
 * on the local filesystem. Used for Docker/VPS deployments.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

interface R2ObjectHttpMetadata {
  contentType?: string;
}

interface R2PutOptions {
  httpMetadata?: R2ObjectHttpMetadata;
  customMetadata?: Record<string, string>;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: R2ObjectHttpMetadata;
  customMetadata?: Record<string, string>;
  etag: string;
  key: string;
  size: number;
}

interface MetadataEntry {
  httpMetadata?: R2ObjectHttpMetadata;
  customMetadata?: Record<string, string>;
  size: number;
}

/**
 * Create an R2Bucket-compatible object backed by the local filesystem.
 */
export function createFileStorage(baseDir: string): R2Bucket {
  // Ensure base directory exists
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }

  const metaDir = join(baseDir, '.meta');
  if (!existsSync(metaDir)) {
    mkdirSync(metaDir, { recursive: true });
  }

  function filePath(key: string): string {
    return join(baseDir, key);
  }

  function metaPath(key: string): string {
    return join(metaDir, `${key}.json`);
  }

  function computeEtag(data: Buffer): string {
    return createHash('md5').update(data).digest('hex');
  }

  const storage = {
    async put(key: string, value: ArrayBuffer | ReadableStream | Uint8Array | string, options?: R2PutOptions): Promise<R2Object> {
      const fp = filePath(key);
      const dir = dirname(fp);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let buf: Buffer;
      if (value instanceof ArrayBuffer) {
        buf = Buffer.from(value);
      } else if (value instanceof Uint8Array) {
        buf = Buffer.from(value);
      } else if (typeof value === 'string') {
        buf = Buffer.from(value, 'utf-8');
      } else {
        // ReadableStream — collect chunks
        const reader = (value as ReadableStream).getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        buf = Buffer.concat(chunks);
      }

      writeFileSync(fp, buf);

      // Store metadata
      const meta: MetadataEntry = {
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
        size: buf.length,
      };
      writeFileSync(metaPath(key), JSON.stringify(meta), 'utf-8');

      const etag = computeEtag(buf);
      return { key, etag, size: buf.length, httpMetadata: meta.httpMetadata } as R2Object;
    },

    async get(key: string): Promise<R2ObjectBody | null> {
      const fp = filePath(key);
      if (!existsSync(fp)) return null;

      const buf = readFileSync(fp);
      const etag = computeEtag(buf);

      let meta: MetadataEntry = { size: buf.length };
      const mp = metaPath(key);
      if (existsSync(mp)) {
        try {
          meta = JSON.parse(readFileSync(mp, 'utf-8'));
        } catch {
          // ignore corrupted metadata
        }
      }

      // Convert Buffer to ReadableStream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        },
      });

      return {
        body: stream,
        httpMetadata: meta.httpMetadata,
        customMetadata: meta.customMetadata,
        etag,
        key,
        size: buf.length,
      };
    },

    async delete(key: string): Promise<void> {
      const fp = filePath(key);
      if (existsSync(fp)) {
        unlinkSync(fp);
      }
      const mp = metaPath(key);
      if (existsSync(mp)) {
        unlinkSync(mp);
      }
    },

    // list/head not used by this project but stubbed for safety
    async list(): Promise<{ objects: R2Object[] }> {
      return { objects: [] };
    },

    async head(key: string): Promise<R2Object | null> {
      const fp = filePath(key);
      if (!existsSync(fp)) return null;
      const buf = readFileSync(fp);
      return { key, etag: computeEtag(buf), size: buf.length } as R2Object;
    },
  };

  return storage as unknown as R2Bucket;
}
