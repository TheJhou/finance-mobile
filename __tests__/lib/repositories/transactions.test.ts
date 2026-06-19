jest.mock("expo-sqlite", () => require("@/__mocks__/expo-sqlite"));

import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/repositories/transactions";

describe("transactions repository", () => {
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
    await db.runAsync(
      "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
      ["cat-1", "Alimentação", "#ef4444", "restaurant"]
    );
  });

  describe("createTransaction", () => {
    it("creates a transaction with required fields", async () => {
      const tx = await createTransaction({
        description: "Mercado",
        amount: 150.5,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.description).toBe("Mercado");
      expect(tx.amount).toBe(150.5);
      expect(tx.type).toBe("EXPENSE");
      expect(tx.status).toBe("PAID");
      expect(tx.paymentMethod).toBe("CASH");
      expect(tx.date).toBe("2025-06-15");
      expect(tx.categoryId).toBe("cat-1");
      expect(tx.id).toBeDefined();
    });

    it("creates a transaction with all optional fields", async () => {
      const tx = await createTransaction({
        description: "Salário",
        amount: 5000,
        type: "INCOME",
        status: "PAID",
        paymentMethod: "BANK_TRANSFER",
        date: "2025-06-01",
        notes: "Mensal",
        categoryId: "cat-1",
        documentType: "NORMAL",
        boletoNumber: null,
        cnpj: "12.345.678/0001-90",
        recipientName: "Empresa X",
      });

      expect(tx.type).toBe("INCOME");
      expect(tx.paymentMethod).toBe("BANK_TRANSFER");
      expect(tx.notes).toBe("Mensal");
      expect(tx.cnpj).toBe("12.345.678/0001-90");
      expect(tx.recipientName).toBe("Empresa X");
    });

    it("defaults status to PAID and paymentMethod to CASH", async () => {
      const tx = await createTransaction({
        description: "Test",
        amount: 10,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      expect(tx.status).toBe("PAID");
      expect(tx.paymentMethod).toBe("CASH");
      expect(tx.documentType).toBe("NORMAL");
    });
  });

  describe("getTransaction", () => {
    it("returns a transaction by id", async () => {
      const created = await createTransaction({
        description: "Test",
        amount: 100,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      const found = await getTransaction(created.id);
      expect(found).not.toBeNull();
      expect(found?.description).toBe("Test");
      expect(found?.category?.name).toBe("Alimentação");
    });

    it("returns null for non-existent id", async () => {
      const found = await getTransaction("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("listTransactions", () => {
    it("returns all transactions ordered by date desc", async () => {
      await createTransaction({
        description: "Old",
        amount: 10,
        type: "EXPENSE",
        date: "2025-01-01",
        categoryId: "cat-1",
      });
      await createTransaction({
        description: "New",
        amount: 20,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      const list = await listTransactions();
      expect(list.length).toBe(2);
      expect(list[0].description).toBe("New");
      expect(list[1].description).toBe("Old");
    });
  });

  describe("updateTransaction", () => {
    it("updates specified fields", async () => {
      const created = await createTransaction({
        description: "Old",
        amount: 100,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      await updateTransaction(created.id, { description: "Updated", amount: 200 });

      const updated = await getTransaction(created.id);
      expect(updated?.description).toBe("Updated");
      expect(updated?.amount).toBe(200);
    });

    it("does nothing when no fields are provided", async () => {
      const created = await createTransaction({
        description: "Test",
        amount: 100,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      await updateTransaction(created.id, {});

      const updated = await getTransaction(created.id);
      expect(updated?.description).toBe("Test");
    });
  });

  describe("deleteTransaction", () => {
    it("removes a transaction", async () => {
      const created = await createTransaction({
        description: "To delete",
        amount: 50,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryId: "cat-1",
      });

      await deleteTransaction(created.id);

      const found = await getTransaction(created.id);
      expect(found).toBeNull();
    });
  });
});
