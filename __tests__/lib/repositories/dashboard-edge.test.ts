jest.mock("expo-sqlite", () => require("@/__mocks__/expo-sqlite"));

import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import { getDashboard } from "@/lib/repositories/dashboard";
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

describe("dashboard edge cases", () => {
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

  describe("sparse data", () => {
    it("handles only income transactions", async () => {
      await seedCategory("cat-1", "Salário");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(3000);
      expect(data.monthlyExpense).toBe(0);
      expect(data.balance).toBe(3000);
    });

    it("handles only expense transactions", async () => {
      await seedCategory("cat-1", "Compras");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Mercado", amount: 500, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(0);
      expect(data.monthlyExpense).toBe(500);
      expect(data.balance).toBe(-500);
    });

    it("handles only pending transactions", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Pendente", amount: 200, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(0);
      expect(data.monthlyExpense).toBe(0);
      expect(data.pendingCount).toBe(1);
    });

    it("handles negative balance (more expenses than income ever)", async () => {
      await seedCategory("cat-1", "Compras");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Gasto", amount: 5000, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.balance).toBe(-5000);
    });
  });

  describe("multi-month scenarios", () => {
    it("ignores transactions from other months for monthly metrics", async () => {
      await seedCategory("cat-1", "Salário");
      await seedCategory("cat-2", "Compras");

      const today = new Date();
      const currentMonth = formatDateLocal(today);
      const prevMonth = new Date(today);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevMonthStr = formatDateLocal(prevMonth);

      await seedTransaction({ description: "Salário atual", amount: 3000, type: "INCOME", status: "PAID", date: currentMonth, categoryId: "cat-1" });
      await seedTransaction({ description: "Salário anterior", amount: 2500, type: "INCOME", status: "PAID", date: prevMonthStr, categoryId: "cat-1" });
      await seedTransaction({ description: "Gasto atual", amount: 1000, type: "EXPENSE", status: "PAID", date: currentMonth, categoryId: "cat-2" });
      await seedTransaction({ description: "Gasto anterior", amount: 800, type: "EXPENSE", status: "PAID", date: prevMonthStr, categoryId: "cat-2" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(3000);
      expect(data.monthlyExpense).toBe(1000);
      expect(data.balance).toBe(3700); // (3000+2500) - (1000+800)
    });
  });

  describe("expenses by category", () => {
    it("aggregates multiple transactions in same category", async () => {
      await seedCategory("cat-1", "Alimentação");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Almoço", amount: 30, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Jantar", amount: 40, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Café", amount: 10, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.expensesByCategory.length).toBe(1);
      expect(data.expensesByCategory[0].value).toBe(80);
    });

    it("returns empty when no expenses exist", async () => {
      await seedCategory("cat-1", "Salário");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.expensesByCategory).toEqual([]);
    });
  });

  describe("monthly trend", () => {
    it("includes data from last 6 months", async () => {
      await seedCategory("cat-1", "Salário");
      await seedCategory("cat-2", "Compras");

      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const dateStr = formatDateLocal(d);
        await seedTransaction({ description: `Salário M${6-i}`, amount: 3000, type: "INCOME", status: "PAID", date: dateStr, categoryId: "cat-1" });
        await seedTransaction({ description: `Gasto M${6-i}`, amount: 1000 + i * 100, type: "EXPENSE", status: "PAID", date: dateStr, categoryId: "cat-2" });
      }

      const data = await getDashboard();
      expect(data.monthlyTrend.length).toBe(6);
      expect(data.monthlyTrend[0].income).toBe(3000);
      expect(data.monthlyTrend[5].expense).toBe(1000);
    });
  });
});
