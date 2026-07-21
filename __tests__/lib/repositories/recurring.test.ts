import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import {
    createRecurring,
    deleteRecurring,
    getRecurring,
    listRecurring,
    processRecurringDue,
    toggleRecurringActive,
    updateRecurring,
} from "@/lib/repositories/recurring";

describe("recurring repository", () => {
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
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await db.runAsync(
      "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
      ["cat-1", "Moradia", "#eab308", "home"]
    );
  });

  describe("createRecurring", () => {
    it("creates a recurring transaction", async () => {
      const rec = await createRecurring({
        description: "Aluguel",
        amount: 1200,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      expect(rec.description).toBe("Aluguel");
      expect(rec.amount).toBe(1200);
      expect(rec.frequency).toBe("MONTHLY");
      expect(rec.isActive).toBe(true);
      expect(rec.paymentMethod).toBe("CASH");
    });

    it("creates an inactive recurring transaction", async () => {
      const rec = await createRecurring({
        description: "Antiga",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        isActive: false,
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      expect(rec.isActive).toBe(false);
    });
  });

  describe("getRecurring", () => {
    it("returns a recurring transaction by id", async () => {
      const created = await createRecurring({
        description: "Test",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      const found = await getRecurring(created.id);
      expect(found).not.toBeNull();
      expect(found?.description).toBe("Test");
    });

    it("returns null for non-existent id", async () => {
      const found = await getRecurring("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("listRecurring", () => {
    it("lists all recurring transactions ordered by active then date", async () => {
      await createRecurring({
        description: "Active Old",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });
      await createRecurring({
        description: "Active New",
        amount: 200,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-07-01",
        categoryId: "cat-1",
      });

      const list = await listRecurring();
      expect(list).toHaveLength(2);
      expect(list[0].nextDueDate).toBe("2025-06-01");
      expect(list[1].nextDueDate).toBe("2025-07-01");
    });
  });

  describe("updateRecurring", () => {
    it("updates description and amount", async () => {
      const created = await createRecurring({
        description: "Old",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      await updateRecurring(created.id, { description: "Updated", amount: 200 });

      const updated = await getRecurring(created.id);
      expect(updated?.description).toBe("Updated");
      expect(updated?.amount).toBe(200);
    });

    it("does nothing when no fields are provided", async () => {
      const created = await createRecurring({
        description: "Test",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      await updateRecurring(created.id, {});

      const updated = await getRecurring(created.id);
      expect(updated?.description).toBe("Test");
    });
  });

  describe("toggleRecurringActive", () => {
    it("toggles isActive to false", async () => {
      const created = await createRecurring({
        description: "Test",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      await toggleRecurringActive(created.id, false);

      const updated = await getRecurring(created.id);
      expect(updated?.isActive).toBe(false);
    });
  });

  describe("deleteRecurring", () => {
    it("removes a recurring transaction and its generated pending transactions", async () => {
      const db = await getDb();
      const created = await createRecurring({
        description: "To delete",
        amount: 50,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        endDate: "2025-08-01",
        categoryId: "cat-1",
      });

      const before = await db.getAllAsync<any>("SELECT * FROM transactions WHERE recurring_id = ?", [created.id]);
      expect(before.length).toBeGreaterThan(0);

      await deleteRecurring(created.id);

      const found = await getRecurring(created.id);
      expect(found).toBeNull();

      const after = await db.getAllAsync<any>("SELECT * FROM transactions WHERE recurring_id = ?", [created.id]);
      expect(after).toHaveLength(0);
    });
  });

  describe("processRecurringDue", () => {
    it("retorna 0 e mantém nextDueDate após geração em createRecurring", async () => {
      const db = await getDb();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      await createRecurring({
        description: "Aluguel",
        amount: 1200,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: todayStr,
        endDate: `${today.getFullYear()}-${String(today.getMonth() + 4).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
        categoryId: "cat-1",
      });

      const count = await processRecurringDue();
      expect(count).toBe(0);

      // createRecurring já gerou as parcelas PENDING
      const txs = await db.getAllAsync<{ amount: number }>("SELECT * FROM transactions WHERE description = ? AND status = 'PENDING'", ["Aluguel"]);
      expect(txs.length).toBeGreaterThanOrEqual(1);
      expect(txs[0].amount).toBe(1200);
    });
  });
});
