import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import {
  getDashboard,
  getOverdueTransactions,
  getUpcomingBills,
  type UpcomingBill,
} from "@/lib/repositories/dashboard";
import { formatDateLocal } from "@/lib/utils";

async function seedCategory(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
    [id, name, "#6366f1", "tag"]
  );
}

async function seedTransaction(data: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  status: "PAID" | "PENDING";
  date: string;
  categoryId: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO transactions (id, description, amount, type, status, date, category_id, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CASH')`,
    [Math.random().toString(36).slice(2), data.description, data.amount, data.type, data.status, data.date, data.categoryId]
  );
}

describe("dashboard repository", () => {
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
  });

  describe("getDashboard", () => {
    it("returns zero values when no transactions exist", async () => {
      await seedCategory("cat-1", "Test");
      const data = await getDashboard();

      expect(data.balance).toBe(0);
      expect(data.monthlyIncome).toBe(0);
      expect(data.monthlyExpense).toBe(0);
      expect(data.pendingCount).toBe(0);
      expect(data.overdueAmount).toBe(0);
      expect(data.expensesByCategory).toEqual([]);
    });

    it("calculates balance correctly", async () => {
      await seedCategory("cat-1", "Salário");
      await seedCategory("cat-2", "Compras");

      await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-1" });
      await seedTransaction({ description: "Mercado", amount: 500, type: "EXPENSE", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-2" });

      const data = await getDashboard();
      expect(data.balance).toBe(2500);
      expect(data.monthlyIncome).toBe(3000);
      expect(data.monthlyExpense).toBe(500);
    });

    it("only counts current month transactions for income/expense", async () => {
      await seedCategory("cat-1", "Salário");
      await seedCategory("cat-2", "Compras");

      const today = formatDateLocal(new Date());
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthStr = formatDateLocal(lastMonth);

      await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Old Salary", amount: 2500, type: "INCOME", status: "PAID", date: lastMonthStr, categoryId: "cat-1" });
      await seedTransaction({ description: "Mercado", amount: 500, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-2" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(3000);
      expect(data.monthlyExpense).toBe(500);
    });

    it("counts pending transactions", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Conta pendente", amount: 200, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Conta vencida", amount: 300, type: "EXPENSE", status: "PENDING", date: "2020-01-01", categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.pendingCount).toBe(2);
      expect(data.overdueAmount).toBe(300);
    });
  });

  describe("getOverdueTransactions", () => {
    it("returns only overdue pending transactions", async () => {
      await seedCategory("cat-1", "Contas");

      await seedTransaction({ description: "Vencida", amount: 100, type: "EXPENSE", status: "PENDING", date: "2020-01-01", categoryId: "cat-1" });
      await seedTransaction({ description: "Futura", amount: 200, type: "EXPENSE", status: "PENDING", date: "2099-01-01", categoryId: "cat-1" });

      const overdue = await getOverdueTransactions();
      expect(overdue.length).toBe(1);
      expect(overdue[0].description).toBe("Vencida");
    });
  });

  describe("getUpcomingBills", () => {
    it("returns recurring transactions within next 30 days", async () => {
      const db = await getDb();
      await seedCategory("cat-1", "Internet");

      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = formatDateLocal(nextWeek);

      await db.runAsync(
        `INSERT INTO recurring_transactions (id, description, amount, type, frequency, next_due_date, start_date, category_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        ["rec-1", "Internet", 100, "EXPENSE", "MONTHLY", nextWeekStr, "2025-01-01", "cat-1"]
      );

      const bills = await getUpcomingBills();
      expect(bills.length).toBe(1);
      expect((bills[0] as UpcomingBill).name).toBe("Internet");
      expect((bills[0] as UpcomingBill).amount).toBe(100);
    });

    it("excludes bills beyond 30 days", async () => {
      const db = await getDb();
      await seedCategory("cat-1", "Internet");

      const today = new Date();
      const future = new Date(today);
      future.setDate(future.getDate() + 60);
      const futureStr = formatDateLocal(future);

      await db.runAsync(
        `INSERT INTO recurring_transactions (id, description, amount, type, frequency, next_due_date, start_date, category_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        ["rec-1", "Internet", 100, "EXPENSE", "MONTHLY", futureStr, "2025-01-01", "cat-1"]
      );

      const bills = await getUpcomingBills();
      expect(bills.length).toBe(0);
    });
  });
});
