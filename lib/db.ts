import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

const DB_NAME = "finance.db";
const DB_KEY_SECURE_STORE = "db_encryption_key_v1";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Gera ou recupera a chave de criptografia do banco do SecureStore.
 * A chave é gerada uma única vez e armazenada de forma segura no keystore/keychain
 * do dispositivo, protegida contra acesso por malware mesmo em dispositivos com root.
 */
async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_SECURE_STORE);
  if (existing) return existing;

  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const hexKey = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await SecureStore.setItemAsync(DB_KEY_SECURE_STORE, hexKey);
  return hexKey;
}

/**
 * Verifica se o banco de dados já existe e tem tabelas.
 * Usa a própria API do SQLite em vez de File para evitar problemas de URI.
 */
async function databaseExists(): Promise<boolean> {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
    try {
      const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      return tables.length > 0;
    } catch {
      // Banco criptografado: não consegue ler sem chave, mas existe
      return true;
    } finally {
      await db.closeAsync();
    }
  } catch {
    return false;
  }
}

/**
 * Verifica se um banco existente é plaintext (sem criptografia).
 * Tenta abrir sem PRAGMA key e ler uma linha.
 * Se conseguir, é plaintext e precisa de migração.
 * Se falhar, já está criptografado com SQLCipher.
 */
async function isPlaintextDatabase(): Promise<boolean> {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
    try {
      await db.getFirstAsync<{ c: number }>("SELECT 1 as c");
      return true;
    } catch {
      return false;
    } finally {
      await db.closeAsync();
    }
  } catch {
    return false;
  }
}

/**
 * Migra um banco plaintext para criptografado usando SQLCipher:
 * 1. Limpa qualquer arquivo temp órfão de migração anterior falha
 * 2. Abre o banco antigo sem chave (plaintext)
 * 3. Usa ATTACH DATABASE com path absoluto + sqlcipher_export() para copiar tudo
 * 4. Deleta o banco antigo e move o temp criptografado para o nome final
 */
async function migrateToEncrypted(encryptionKey: string): Promise<SQLite.SQLiteDatabase> {
  const tempDbName = "finance_encrypted_tmp";
  const dbDir = SQLite.defaultDatabaseDirectory as string;
  const tempDbPath = `${dbDir}/${tempDbName}`;
  const finalDbPath = `${dbDir}/${DB_NAME}`;

  // Limpa arquivo temp órfão de migração anterior que pode ter falhado
  try {
    await SQLite.deleteDatabaseAsync(tempDbName);
  } catch {
    // ignora se não existir
  }

  const plainDb = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
  try {
    // ATTACH DATABASE com path absoluto (não relativo) para funcionar no Android
    await plainDb.execAsync(`ATTACH DATABASE '${tempDbPath}' AS encrypted KEY '${encryptionKey}'`);
    await plainDb.execAsync("SELECT sqlcipher_export('encrypted')");
    await plainDb.execAsync("DETACH DATABASE encrypted");
  } finally {
    await plainDb.closeAsync();
  }

  // Move o banco criptografado temp para o nome final (sobrescreve o antigo)
  // Constrói URI file:// absoluta a partir do diretório do SQLite
  new File(`file://${dbDir}/${tempDbName}`).move(new File(`file://${dbDir}/${DB_NAME}`));

  // Abre o banco final criptografado
  const finalDb = await SQLite.openDatabaseAsync(DB_NAME);
  await finalDb.execAsync(`PRAGMA key = '${encryptionKey}'`);
  return finalDb;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const encryptionKey = await getOrCreateDbKey();

      if (Platform.OS === "web") {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        await migrate(db);
        return db;
      }

      const dbExists = await databaseExists();
      let db: SQLite.SQLiteDatabase;

      if (!dbExists) {
        // First run - cria novo banco criptografado diretamente (sem migração)
        db = await SQLite.openDatabaseAsync(DB_NAME);
        await db.execAsync(`PRAGMA key = '${encryptionKey}'`);
      } else {
        const isPlaintext = await isPlaintextDatabase();
        if (isPlaintext) {
          console.log("[DB] Migrating plaintext database to SQLCipher encryption...");
          db = await migrateToEncrypted(encryptionKey);
          console.log("[DB] Migration to encrypted database complete.");
        } else {
          db = await SQLite.openDatabaseAsync(DB_NAME);
          await db.execAsync(`PRAGMA key = '${encryptionKey}'`);
        }
      }

      await migrate(db);
      return db;
    })().catch((err) => {
      // Reset cache em caso de falha para permitir retry na próxima chamada
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Reseta o cache do banco. Usado em testes. */
export function resetDbCache(): void {
  dbPromise = null;
}

const CURRENT_DB_VERSION = 4;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);

  const versionRow = await db.getFirstAsync<{ version: number }>("PRAGMA user_version");
  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion === 0) {
    await db.execAsync(`
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
        boleto_number TEXT,
        cnpj TEXT,
        recipient_name TEXT,
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

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_notifications (
        id TEXT PRIMARY KEY,
        package_name TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        amount REAL NOT NULL,
        post_time INTEGER NOT NULL,
        processed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_processed_notifications_hash ON processed_notifications(package_name, title, text, amount, post_time);

      CREATE TABLE IF NOT EXISTS notification_queue (
        id TEXT PRIMARY KEY,
        package_name TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        big_text TEXT,
        sub_text TEXT,
        post_time INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'PENDING_AI' CHECK(status IN ('PENDING_AI','AI_PROCESSED','APPROVED','REJECTED')),
        ai_enriched INTEGER NOT NULL DEFAULT 0,
        amount REAL,
        description TEXT,
        type TEXT,
        payment_method TEXT,
        bank TEXT,
        category_id TEXT,
        category_name TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status);
      CREATE INDEX IF NOT EXISTS idx_notif_queue_dedup ON notification_queue(package_name, title, text, amount, post_time);

      CREATE TABLE IF NOT EXISTS backup_metadata (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT,
        version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        tables TEXT NOT NULL,
        encrypted INTEGER NOT NULL DEFAULT 0,
        device_info TEXT,
        restored_at TEXT,
        restore_user_id TEXT
      );

      CREATE TABLE IF NOT EXISTS backup_schedule (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        last_backup TEXT NOT NULL,
        next_backup TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        backup_time TEXT NOT NULL DEFAULT '02:00',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar_url TEXT,
        preferences TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_info TEXT,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS financial_institutions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        institution_id TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK(account_type IN ('CHECKING','SAVINGS','CREDIT','INVESTMENT')),
        account_number TEXT,
        branch_number TEXT,
        nickname TEXT,
        balance REAL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (institution_id) REFERENCES financial_institutions(id)
      );
    `);
  }

  if (currentVersion < 1) {
    const tableInfo = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(transactions)`
    );
    const existingCols = new Set(tableInfo.map((c) => c.name));

    const colsToAdd: string[] = [];
    if (!existingCols.has("document_type"))
      colsToAdd.push(`ALTER TABLE transactions ADD COLUMN document_type TEXT NOT NULL DEFAULT 'NORMAL'`);
    if (!existingCols.has("boleto_number"))
      colsToAdd.push(`ALTER TABLE transactions ADD COLUMN boleto_number TEXT`);
    if (!existingCols.has("cnpj"))
      colsToAdd.push(`ALTER TABLE transactions ADD COLUMN cnpj TEXT`);
    if (!existingCols.has("recipient_name"))
      colsToAdd.push(`ALTER TABLE transactions ADD COLUMN recipient_name TEXT`);

    if (colsToAdd.length > 0) {
      await db.execAsync(colsToAdd.join("; "));
    }
  }

  if (currentVersion < 2) {
    const tableInfoV2 = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(transactions)`
    );
    const existingColsV2 = new Set(tableInfoV2.map((c) => c.name));

    const colsToAddV2: string[] = [];
    if (!existingColsV2.has("source"))
      colsToAddV2.push(`ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'`);
    if (!existingColsV2.has("bank_origin"))
      colsToAddV2.push(`ALTER TABLE transactions ADD COLUMN bank_origin TEXT`);

    const indexesToCreate = [
      `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method)`,
    ];

    const stmts = [...colsToAddV2, ...indexesToCreate];
    if (stmts.length > 0) {
      await db.execAsync(stmts.join("; "));
    }
  }

  if (currentVersion < 3) {
    await addMultiUserSupport(db);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user ON recurring_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
    `);
  }

  if (currentVersion < 4) {
    const queueCols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(notification_queue)`
    );
    const existingQueueCols = new Set(queueCols.map((c) => c.name));

    const queueColsToAdd: string[] = [];
    if (!existingQueueCols.has("ai_retry_count"))
      queueColsToAdd.push(`ALTER TABLE notification_queue ADD COLUMN ai_retry_count INTEGER NOT NULL DEFAULT 0`);
    if (!existingQueueCols.has("last_ai_attempt"))
      queueColsToAdd.push(`ALTER TABLE notification_queue ADD COLUMN last_ai_attempt TEXT`);
    if (!existingQueueCols.has("processing_lock"))
      queueColsToAdd.push(`ALTER TABLE notification_queue ADD COLUMN processing_lock TEXT`);

    if (queueColsToAdd.length > 0) {
      await db.execAsync(queueColsToAdd.join("; "));
    }

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_notif_queue_retry ON notification_queue(ai_enriched, ai_retry_count);
      CREATE INDEX IF NOT EXISTS idx_notif_queue_lock ON notification_queue(processing_lock);

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SYNCED','FAILED'))
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(retry_count);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_DB_VERSION}`);

  await seedDefaultCategories(db);
  await cleanupOldProcessedNotifications(db);
  await seedFinancialInstitutions(db);
  await cleanupOldNotificationQueue(db);
}

async function cleanupOldProcessedNotifications(db: SQLite.SQLiteDatabase): Promise<void> {
  // Remove notificações processadas há mais de 30 dias
  await db.execAsync(`
    DELETE FROM processed_notifications
    WHERE processed_at < datetime('now', '-30 days')
  `);
}

async function addMultiUserSupport(db: SQLite.SQLiteDatabase): Promise<void> {
  const tables = ['categories', 'transactions', 'recurring_transactions', 'settings'];
  for (const tableName of tables) {
    const columns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${tableName})`
    );
    const columnNames = new Set(columns.map((c) => c.name));
    if (!columnNames.has("user_id")) {
      await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN user_id TEXT`);
      const defaultUserId = 'user_default_' + Date.now();
      await db.runAsync(`UPDATE ${tableName} SET user_id = ? WHERE user_id IS NULL`, [defaultUserId]);
      console.log(`[DB] Added user_id to ${tableName} and migrated existing data`);
    }
  }
}

async function cleanupOldNotificationQueue(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM notification_queue
    WHERE status IN ('REJECTED', 'APPROVED') AND created_at < datetime('now', '-30 days');
    DELETE FROM notification_queue
    WHERE status = 'PENDING_AI' AND ai_retry_count >= 3 AND created_at < datetime('now', '-7 days');
    DELETE FROM sync_queue
    WHERE status IN ('SYNCED', 'FAILED') AND created_at < datetime('now', '-30 days');
  `);
}

async function seedFinancialInstitutions(db: SQLite.SQLiteDatabase): Promise<void> {
  // Seed major Brazilian banks for OpenFinance preparation
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM financial_institutions"
  );
  if ((row?.count ?? 0) > 0) return;

  const institutions = [
    { name: "Banco do Brasil", code: "001" },
    { name: "Caixa Econômica Federal", code: "104" },
    { name: "Bradesco", code: "237" },
    { name: "Itaú Unibanco", code: "341" },
    { name: "Santander", code: "033" },
    { name: "Banco Inter", code: "077" },
    { name: "NuBank", code: "260" },
    { name: "PicPay", code: "336" },
    { name: "Mercado Pago", code: "413" },
    { name: "Banco Original", code: "212" },
  ];

  const values = institutions.map(i => `('${generateId()}', '${i.name}', '${i.code}')`).join(', ');
  await db.execAsync(
    `INSERT INTO financial_institutions (id, name, code) VALUES ${values}`
  );

  console.log("[DB] Seeded financial institutions for OpenFinance");
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

export async function isNotificationProcessed(
  packageName: string,
  title: string,
  text: string,
  amount: number,
  postTime: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM processed_notifications 
     WHERE package_name = ? AND title = ? AND text = ? AND amount = ? AND post_time = ?`,
    [packageName, title, text, amount, postTime]
  );
  return (result?.count ?? 0) > 0;
}

export async function markNotificationAsProcessed(
  packageName: string,
  title: string,
  text: string,
  amount: number,
  postTime: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO processed_notifications (id, package_name, title, text, amount, post_time) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [generateId(), packageName, title, text, amount, postTime]
  );
}
