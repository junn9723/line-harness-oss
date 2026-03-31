declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): void;
};

declare class Buffer extends Uint8Array {
  static from(data: ArrayBuffer | Uint8Array | string, encoding?: string): Buffer;
  static concat(chunks: Uint8Array[]): Buffer;
}

interface ImportMeta {
  url: string;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  export function readFileSync(path: string): Buffer;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string | Uint8Array, encoding?: 'utf-8'): void;
  export function unlinkSync(path: string): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: Uint8Array): { digest(encoding: 'hex'): string };
  };
}
