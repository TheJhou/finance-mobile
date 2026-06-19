import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { generateId, isNotificationProcessed, markNotificationAsProcessed } from "@/lib/db";
import { getDb } from "@/lib/db";

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique ids on multiple calls", () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });

  it("contains a hyphen separating timestamp and random part", () => {
    const id = generateId();
    expect(id).toMatch(/^\w+-\w+$/);
  });
});

describe("notification processing", () => {
  beforeEach(async () => {
    resetMockDatabase();
    const db = await getDb();
    await db.execAsync(`
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
    `);
  });

  describe("isNotificationProcessed", () => {
    it("returns false for unprocessed notification", async () => {
      const result = await isNotificationProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );
      expect(result).toBe(false);
    });

    it("returns true for processed notification", async () => {
      await markNotificationAsProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );

      const result = await isNotificationProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );
      expect(result).toBe(true);
    });

    it("returns false when only amount differs", async () => {
      await markNotificationAsProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );

      const result = await isNotificationProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        100,
        1710000000000
      );
      expect(result).toBe(false);
    });

    it("returns false when only post_time differs", async () => {
      await markNotificationAsProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );

      const result = await isNotificationProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000001
      );
      expect(result).toBe(false);
    });

    it("handles multiple different notifications independently", async () => {
      await markNotificationAsProcessed("com.nubank", "Nubank", "Tx1", 10, 1000);
      await markNotificationAsProcessed("com.itau", "Itaú", "Tx2", 20, 2000);
      await markNotificationAsProcessed("com.nubank", "Nubank", "Tx3", 30, 3000);

      expect(await isNotificationProcessed("com.nubank", "Nubank", "Tx1", 10, 1000)).toBe(true);
      expect(await isNotificationProcessed("com.itau", "Itaú", "Tx2", 20, 2000)).toBe(true);
      expect(await isNotificationProcessed("com.nubank", "Nubank", "Tx3", 30, 3000)).toBe(true);
      expect(await isNotificationProcessed("com.nubank", "Nubank", "Tx4", 40, 4000)).toBe(false);
    });
  });

  describe("markNotificationAsProcessed", () => {
    it("stores notification data", async () => {
      await markNotificationAsProcessed(
        "com.nubank",
        "Nubank",
        "Você pagou R$ 50,00",
        50,
        1710000000000
      );

      const db = await getDb();
      const rows = await db.getAllAsync("SELECT * FROM processed_notifications");
      expect(rows.length).toBe(1);
      expect(rows[0].package_name).toBe("com.nubank");
      expect(rows[0].title).toBe("Nubank");
      expect(rows[0].text).toBe("Você pagou R$ 50,00");
      expect(rows[0].amount).toBe(50);
      expect(rows[0].post_time).toBe(1710000000000);
    });

    it("does not throw when marking same notification twice", async () => {
      await markNotificationAsProcessed("pkg", "title", "text", 1, 1);
      await markNotificationAsProcessed("pkg", "title", "text", 1, 1);

      const db = await getDb();
      const rows = await db.getAllAsync("SELECT * FROM processed_notifications");
      expect(rows.length).toBe(2);
    });
  });
});
