import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import { createTransaction, getTransaction, listTransactions } from "@/lib/repositories/transactions";

describe("transactions edge cases", () => {
  beforeEach(async () => {
    resetMockDatabase();
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#6366f1',
        icon TEXT NOT NULL DEFAULT 'tag',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
        status TEXT NOT NULL DEFAULT 'PAID',
        payment_method TEXT NOT NULL DEFAULT 'CASH',
        date TEXT NOT NULL,
        notes TEXT,
        category_id TEXT NOT NULL,
        boleto_number TEXT,
        cnpj TEXT,
        recipient_name TEXT,
        document_type TEXT DEFAULT 'NORMAL',
        created_at TEXT,
        updated_at TEXT
      );
    `);
  });

  describe("boundary dates", () => {
    it("handles first day of month", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Start of month",
        amount: 100,
        type: "EXPENSE",
        date: "2025-01-01",
        categoryId: "cat-1",
      });

      expect(tx.date).toBe("2025-01-01");
    });

    it("handles last day of month (31 days)", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "End of month",
        amount: 100,
        type: "EXPENSE",
        date: "2025-01-31",
        categoryId: "cat-1",
      });

      expect(tx.date).toBe("2025-01-31");
    });

    it("handles leap year February 29", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Leap year",
        amount: 100,
        type: "EXPENSE",
        date: "2024-02-29",
        categoryId: "cat-1",
      });

      expect(tx.date).toBe("2024-02-29");
    });

    it("handles year boundary", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "New Year",
        amount: 100,
        type: "EXPENSE",
        date: "2025-12-31",
        categoryId: "cat-1",
      });

      expect(tx.date).toBe("2025-12-31");
    });
  });

  describe("amount edge cases", () => {
    it("handles very small amounts", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Centavos",
        amount: 0.01,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.amount).toBe(0.01);
    });

    it("handles large amounts", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Large",
        amount: 999999.99,
        type: "INCOME",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.amount).toBe(999999.99);
    });

    it("handles zero amount", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Zero",
        amount: 0,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.amount).toBe(0);
    });
  });

  describe("description edge cases", () => {
    it("handles unicode and special characters", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "Café ☕ & Pão 🥖 — R$12,50",
        amount: 12.5,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.description).toBe("Café ☕ & Pão 🥖 — R$12,50");
    });

    it("handles empty notes as null", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      const tx = await createTransaction({
        description: "No notes",
        amount: 100,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
        notes: null,
      });

      expect(tx.notes).toBeNull();
    });
  });

  describe("category mapping", () => {
    it("includes category when category exists", async () => {
      await (await getDb()).runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Alimentação", "#ef4444", "restaurant"]
      );

      const tx = await createTransaction({
        description: "Mercado",
        amount: 100,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.category).toBeDefined();
      expect(tx.category?.name).toBe("Alimentação");
      expect(tx.category?.color).toBe("#ef4444");
    });
  });

  describe("ordering", () => {
    it("orders by date desc then created_at desc", async () => {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
        ["cat-1", "Test", "#6366f1", "tag"]
      );

      // Insert directly with created_at to test ordering
      await db.runAsync(
        `INSERT INTO transactions (id, description, amount, type, status, payment_method, date, notes, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["id-a", "A", 1, "EXPENSE", "PAID", "CASH", "2025-06-15", null, "cat-1", "2025-06-15T10:00:00Z", "2025-06-15T10:00:00Z"]
      );
      await db.runAsync(
        `INSERT INTO transactions (id, description, amount, type, status, payment_method, date, notes, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["id-b", "B", 2, "EXPENSE", "PAID", "CASH", "2025-06-15", null, "cat-1", "2025-06-15T11:00:00Z", "2025-06-15T11:00:00Z"]
      );
      await db.runAsync(
        `INSERT INTO transactions (id, description, amount, type, status, payment_method, date, notes, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["id-c", "C", 3, "EXPENSE", "PAID", "CASH", "2025-06-14", null, "cat-1", "2025-06-14T10:00:00Z", "2025-06-14T10:00:00Z"]
      );

      const list = await listTransactions();
      expect(list[0].description).toBe("B");
      expect(list[1].description).toBe("A");
      expect(list[2].description).toBe("C");
    });
  });
});
