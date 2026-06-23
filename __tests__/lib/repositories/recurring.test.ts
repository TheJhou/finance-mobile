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
      expect(list.length).toBe(2);
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
    it("removes a recurring transaction", async () => {
      const created = await createRecurring({
        description: "To delete",
        amount: 50,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: "2025-06-01",
        categoryId: "cat-1",
      });

      await deleteRecurring(created.id);

      const found = await getRecurring(created.id);
      expect(found).toBeNull();
    });
  });

  describe("processRecurringDue", () => {
    it("creates transactions for due recurring items", async () => {
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
        categoryId: "cat-1",
      });

      const created = await processRecurringDue();
      expect(created).toBe(1);

      // Verify transaction was created
      const txs = await db.getAllAsync<{ amount: number }>("SELECT * FROM transactions WHERE description = ?", ["Aluguel"]);
      expect(txs.length).toBe(1);
      expect(txs[0].amount).toBe(1200);
    });

    it("does not create transactions for future due dates", async () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

      await createRecurring({
        description: "Futuro",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: futureStr,
        categoryId: "cat-1",
      });

      const created = await processRecurringDue();
      expect(created).toBe(0);
    });

    it("deactivates recurring when end_date is reached", async () => {
      const db = await getDb();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const rec = await createRecurring({
        description: "One time",
        amount: 100,
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: "2025-01-01",
        nextDueDate: todayStr,
        endDate: todayStr,
        categoryId: "cat-1",
      });

      await processRecurringDue();

      const updated = await getRecurring(rec.id);
      expect(updated?.isActive).toBe(false);
    });
  });
});
