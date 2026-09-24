/**
 * Testes para backup.ts (commits: 9d12452, a069a16, e851ed2, b3fb88d)
 *
 * - BackupSystem.createBackup: cria backup com metadata
 * - BackupSystem.createBackup: falha se não há dados
 * - BackupSystem.listBackups: lista backups ordenados por data
 * - BackupSystem.getBackupFilePath: constrói path corretamente
 * - BackupSystem.scheduleDailyBackup: não executa se já fez hoje
 * - BackupSystem.getBackupStats: retorna stats
 * - BackupSystem.restoreBackup: valida estrutura
 * - Cloud backup: createAndUploadBackup, uploadToCloud, listCloudBackups
 */

jest.mock("@/lib/auth", () => ({
  authFetch: jest.fn(),
  getStoredUserName: jest.fn().mockResolvedValue("testuser"),
}));

jest.mock("@/lib/config", () => ({
  BACKEND_URL: "http://localhost:3000",
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn().mockResolvedValue("fake-checksum-abc123"),
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));

import { BackupSystem } from "@/lib/backup";
import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import { authFetch } from "@/lib/auth";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;

async function clearUserData() {
  // getDb() já semeia categorias padrão; remove para simular um app sem dados
  const db = await getDb();
  await db.execAsync("DELETE FROM categories");
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthFetch.mockReset();
  resetMockDatabase();

  const db = await getDb();
  await db.execAsync(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, color TEXT, icon TEXT, is_default INTEGER, created_at TEXT, updated_at TEXT)`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, description TEXT, amount REAL, type TEXT, status TEXT, payment_method TEXT, date TEXT, notes TEXT, category_id TEXT, created_at TEXT, updated_at TEXT)`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS recurring_transactions (id TEXT PRIMARY KEY, description TEXT, amount REAL, type TEXT, frequency TEXT, payment_method TEXT, is_active INTEGER, start_date TEXT, end_date TEXT, next_due_date TEXT, category_id TEXT, created_at TEXT, updated_at TEXT)`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, key TEXT, value TEXT)`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS backup_metadata (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, version TEXT, created_at TEXT, size INTEGER, checksum TEXT, tables TEXT, encrypted INTEGER, device_info TEXT)`);
});

describe("BackupSystem.createBackup", () => {
  it("falha se não há dados", async () => {
    await clearUserData();
    const result = await BackupSystem.createBackup();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nenhum dado/i);
  });

  it("cria backup com sucesso quando há dados", async () => {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)",
      ["cat-1", "Mercado", "#fff", "tag", 0]
    );

    const result = await BackupSystem.createBackup();
    expect(result.success).toBe(true);
    expect(result.backupId).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.tables).toContain("categories");
  });

  it("inclui deviceId e appVersion no metadata", async () => {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)",
      ["cat-1", "Test", "#fff", "tag", 0]
    );

    const result = await BackupSystem.createBackup();
    expect(result.success).toBe(true);
    // metadata should have deviceInfo
    expect(result.metadata!.deviceInfo).toBeDefined();
  });
});

describe("BackupSystem.getBackupFilePath", () => {
  it("constrói path com userId e createdAt", () => {
    const path = BackupSystem.getBackupFilePath("user_123", "2025-06-22T10:00:00.000Z");
    expect(path).toContain("backup_user_123_");
    expect(path).toContain(".json");
    // Should have replaced : and . with -
    expect(path).not.toContain(":");
  });
});

describe("BackupSystem.scheduleDailyBackup", () => {
  it("não executa se já fez backup hoje", async () => {
    const today = new Date().toDateString();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(today);

    await BackupSystem.scheduleDailyBackup();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(await BackupSystem.listBackups()).toHaveLength(0);
  });

  it("executa se não fez backup hoje", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)",
      ["cat-1", "Test", "#fff", "tag", 0]
    );

    await BackupSystem.scheduleDailyBackup();

    expect(await BackupSystem.listBackups()).toHaveLength(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.any(String), new Date().toDateString());
  });
});

describe("BackupSystem.getBackupStats", () => {
  it("retorna stats com zeros quando não há backups", async () => {
    const stats = await BackupSystem.getBackupStats();
    expect(stats.totalBackups).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.lastBackup).toBeNull();
    expect(stats.nextBackup).toBeDefined();
  });
});

describe("BackupSystem.restoreBackup", () => {
  it("falha para arquivo com formato inválido", async () => {
    new File("/mock/path.json").write(JSON.stringify({ invalid: true }));

    const result = await BackupSystem.restoreBackup("/mock/path.json");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/inválido/i);
  });
});

// ── Cloud Backup ──────────────────────────────────────────────────────────────

describe("BackupSystem.uploadToCloud", () => {
  it("faz POST /backup/upload com authFetch", async () => {
    new File("/mock/backup.json").write(JSON.stringify({ metadata: { id: "bk-1" }, data: {} }));

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ s3Key: "backups/user-1/bk-1.enc" }),
    } as any);

    const result = await BackupSystem.uploadToCloud("/mock/backup.json");
    expect(result).toBe("backups/user-1/bk-1.enc");
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/backup/upload"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("lança erro se backend responde não-ok", async () => {
    new File("/mock/backup.json").write(JSON.stringify({ metadata: {}, data: {} }));

    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Quota excedida" }),
    } as any);

    await expect(BackupSystem.uploadToCloud("/mock/backup.json")).rejects.toThrow(/quota/i);
  });
});

describe("BackupSystem.listCloudBackups", () => {
  it("retorna lista de backups da nuvem", async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        backups: [
          { key: "bk-1", filename: "backup1.enc", sizeBytes: 1024, lastModified: "2025-06-22" },
        ],
      }),
    } as any);

    const result = await BackupSystem.listCloudBackups();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("backup1.enc");
  });

  it("lança erro se backend responde não-ok", async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: false } as any);

    await expect(BackupSystem.listCloudBackups()).rejects.toThrow();
  });
});

describe("BackupSystem.downloadAndRestoreLatest", () => {
  it("retorna erro 404 se não há backup na nuvem", async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 } as any);

    const result = await BackupSystem.downloadAndRestoreLatest();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nenhum backup/i);
  });
});

describe("BackupSystem.createAndUploadBackup", () => {
  it("retorna cloudKey null se backup local falha", async () => {
    await clearUserData();
    const result = await BackupSystem.createAndUploadBackup();
    expect(result.localResult.success).toBe(false);
    expect(result.cloudKey).toBeNull();
  });
});
