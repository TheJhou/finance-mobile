// Mock de expo-sqlite para testes unitários, apoiado em SQLite real (node:sqlite, Node >= 22.5).
// Usar o motor real garante que os testes validem o SQL de verdade:
// funções de data, GROUP BY, constraints e foreign keys.

type SqlValue = string | number | null | Uint8Array;
type BindValue = SqlValue | boolean | undefined;
type BindParams = BindValue[] | Record<string, BindValue>;

interface StatementSync {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

function loadDatabaseSync(): new (path: string) => DatabaseSync {
  // node:sqlite ainda emite ExperimentalWarning; silencia só durante o require.
  const originalEmit = process.emitWarning;
  process.emitWarning = (() => {}) as typeof process.emitWarning;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:sqlite").DatabaseSync;
  } finally {
    process.emitWarning = originalEmit;
  }
}

const NodeDatabase = loadDatabaseSync();

function toSqlValue(value: BindValue): SqlValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/** Aceita as duas formas do expo-sqlite: (sql, [a, b]) e (sql, a, b). */
function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return (params[0] as BindValue[]).map(toSqlValue);
  }
  if (params.length === 1 && params[0] !== null && typeof params[0] === "object" && !(params[0] instanceof Uint8Array)) {
    const named: Record<string, SqlValue> = {};
    for (const [k, v] of Object.entries(params[0] as Record<string, BindValue>)) {
      named[k.replace(/^[:$@]/, "")] = toSqlValue(v);
    }
    return [named];
  }
  return (params as BindValue[]).map(toSqlValue);
}

// node:sqlite devolve objetos sem prototype; converte para objetos comuns.
function toPlain<T>(row: Record<string, unknown> | undefined): T | null {
  return row ? ({ ...row } as T) : null;
}

class MockSQLiteDatabase {
  constructor(private readonly db: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }> {
    const result = this.db.prepare(sql).run(...normalizeParams(params));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return toPlain<T>(this.db.prepare(sql).get(...normalizeParams(params)));
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...normalizeParams(params)).map((row) => toPlain<T>(row) as T);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec("BEGIN");
    try {
      await task();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    // Conexão compartilhada entre todos os "opens" do teste; fecha só no reset.
  }
}

let current: { raw: DatabaseSync; db: MockSQLiteDatabase } | null = null;

function getCurrent(): MockSQLiteDatabase {
  if (!current) {
    const raw = new NodeDatabase(":memory:");
    current = { raw, db: new MockSQLiteDatabase(raw) };
  }
  return current.db;
}

export type SQLiteDatabase = MockSQLiteDatabase;

export function openDatabaseAsync(
  _name: string,
  _options?: { useNewConnection?: boolean; enableChangeListener?: boolean }
): Promise<MockSQLiteDatabase> {
  return Promise.resolve(getCurrent());
}

export function resetMockDatabase(): void {
  current?.raw.close();
  current = null;
}

export async function deleteDatabaseAsync(_name: string): Promise<void> {
  resetMockDatabase();
}

export const defaultDatabaseDirectory = "/mock/databases";
