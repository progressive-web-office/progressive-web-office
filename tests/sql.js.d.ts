// The little of sql.js the tests use (it has no types of its own).
declare module 'sql.js' {
  interface Database {
    run(sql: string): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    export(): Uint8Array;
  }
  export default function initSqlJs(config: { wasmBinary: ArrayBuffer }): Promise<{ Database: new (data?: Uint8Array) => Database }>;
}
