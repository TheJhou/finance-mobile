import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("finance.db");
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'tag',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
      status TEXT NOT NULL DEFAULT 'PAID' CHECK(status IN ('PAID','PENDING','OVERDUE')),
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      date TEXT NOT NULL,
      notes TEXT,
      category_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
      frequency TEXT NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','YEARLY')),
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      is_active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT,
      next_due_date TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON recurring_transactions(next_due_date);
  `);

  await seedDefaultCategories(db);
}

async function seedDefaultCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM categories"
  );
  if ((row?.count ?? 0) > 0) return;

  const defaults: { name: string; color: string; icon: string }[] = [
    { name: "Alimentação", color: "#ef4444", icon: "restaurant" },
    { name: "Transporte", color: "#f97316", icon: "car" },
    { name: "Moradia", color: "#eab308", icon: "home" },
    { name: "Saúde", color: "#22c55e", icon: "medkit" },
    { name: "Lazer", color: "#06b6d4", icon: "game-controller" },
    { name: "Educação", color: "#3b82f6", icon: "school" },
    { name: "Compras", color: "#a855f7", icon: "bag" },
    { name: "Salário", color: "#10b981", icon: "cash" },
    { name: "Investimentos", color: "#8b5cf6", icon: "trending-up" },
    { name: "Outros", color: "#6b7280", icon: "ellipsis-horizontal" },
  ];

  for (const c of defaults) {
    await db.runAsync(
      "INSERT INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, 1)",
      [generateId(), c.name, c.color, c.icon]
    );
  }
}

export function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}
