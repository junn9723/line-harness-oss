declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string);
    pragma(statement: string): unknown;
    prepare(sql: string): Database.Statement;
    exec(sql: string): void;
    transaction<T>(fn: () => T): () => T;
    close(): void;
  }

  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Statement {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): RunResult;
    }
  }

  export = Database;
}
