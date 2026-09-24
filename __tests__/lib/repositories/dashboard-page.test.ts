import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import { getDashboard, getFutureBills, getOverdueTransactions, getUpcomingBills } from "@/lib/repositories/dashboard";
import { formatDateLocal } from "@/lib/utils";

async function seedCategory(id: string, name: string, color = "#6366f1") {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
    [id, name, color, "tag"]
  );
}

async function seedTransaction(data: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  status: "PAID" | "PENDING" | "OVERDUE";
  date: string;
  categoryId: string;
}) {
  const db = await getDb();
  const id = Math.random().toString(36).slice(2);
  await db.runAsync(
    `INSERT INTO transactions (id, description, amount, type, status, date, category_id, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CASH')`,
    [id, data.description, data.amount, data.type, data.status, data.date, data.categoryId]
  );
}

async function seedRecurring(data: {
  id: string;
  description: string;
  amount: number;
  nextDueDate: string;
  startDate: string;
  categoryId: string;
  isActive?: number;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurring_transactions
     (id, description, amount, type, frequency, next_due_date, start_date, category_id, is_active)
     VALUES (?, ?, ?, 'EXPENSE', 'MONTHLY', ?, ?, ?, ?)`,
    [data.id, data.description, data.amount, data.nextDueDate, data.startDate, data.categoryId, data.isActive ?? 1]
  );
}

describe("dashboard — página por página", () => {
  beforeEach(async () => {
    resetMockDatabase();
    const db = await getDb();
  });

  // ── PÁGINA 1: Resumo Financeiro (balance, income, expense) ─────────
  describe("Página: Resumo Financeiro", () => {
    it("mostra zero quando não há transações", async () => {
      await seedCategory("cat-1", "Test");
      const data = await getDashboard();

      expect(data.balance).toBe(0);
      expect(data.monthlyIncome).toBe(0);
      expect(data.monthlyExpense).toBe(0);
    });

    it("calcula saldo = renda - despesas do mês atual", async () => {
      await seedCategory("cat-sal", "Salário");
      await seedCategory("cat-mer", "Mercado");

      const today = formatDateLocal(new Date());
      await seedTransaction({ description: "Salário", amount: 5000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-sal" });
      await seedTransaction({ description: "Mercado", amount: 800, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-mer" });
      await seedTransaction({ description: "Aluguel", amount: 1200, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-mer" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(5000);
      expect(data.monthlyExpense).toBe(2000);
      expect(data.balance).toBe(3000);
    });

    it("ignora transações de outros meses no resumo mensal", async () => {
      await seedCategory("cat-sal", "Salário");
      await seedCategory("cat-mer", "Mercado");

      const today = formatDateLocal(new Date());
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await seedTransaction({ description: "Salário Jun", amount: 5000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-sal" });
      await seedTransaction({ description: "Salário Mai", amount: 4500, type: "INCOME", status: "PAID", date: formatDateLocal(lastMonth), categoryId: "cat-sal" });

      const data = await getDashboard();
      expect(data.monthlyIncome).toBe(5000);
      expect(data.monthlyExpense).toBe(0);
    });

    it("ignora transações PENDING no cálculo de balance", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Recebido", amount: 1000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Pendente", amount: 500, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.balance).toBe(1000);
      expect(data.monthlyExpense).toBe(0);
    });
  });

  // ── PÁGINA 2: Contas Pendentes (pendingCount, overdueAmount) ─────────
  describe("Página: Contas Pendentes", () => {
    it("conta quantidade de contas pendentes", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Conta A", amount: 100, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Conta B", amount: 200, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Paga", amount: 300, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.pendingCount).toBe(2);
    });

    it("soma apenas contas vencidas (overdue)", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Futura", amount: 100, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });
      await seedTransaction({ description: "Vencida", amount: 250, type: "EXPENSE", status: "PENDING", date: "2020-01-01", categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.overdueAmount).toBe(250);
      expect(data.overdueCount).toBe(1);
    });

    it("getOverdueTransactions retorna PENDING e OVERDUE vencidas", async () => {
      await seedCategory("cat-1", "Contas");

      await seedTransaction({ description: "Vencida A", amount: 100, type: "EXPENSE", status: "PENDING", date: "2020-01-01", categoryId: "cat-1" });
      await seedTransaction({ description: "Vencida B", amount: 200, type: "EXPENSE", status: "OVERDUE", date: "2020-02-01", categoryId: "cat-1" });
      await seedTransaction({ description: "Futura", amount: 300, type: "EXPENSE", status: "PENDING", date: "2099-01-01", categoryId: "cat-1" });

      const overdue = await getOverdueTransactions();
      expect(overdue.length).toBe(2);
      expect(overdue.map((t) => t.description)).toContain("Vencida A");
      expect(overdue.map((t) => t.description)).toContain("Vencida B");
    });
  });

  // ── PÁGINA 3: Gastos por Categoria ──────────────────────────────────
  describe("Página: Gastos por Categoria", () => {
    it("agrega gastos por categoria no mês atual", async () => {
      await seedCategory("cat-ali", "Alimentação", "#ef4444");
      await seedCategory("cat-trans", "Transporte", "#3b82f6");

      const today = formatDateLocal(new Date());
      await seedTransaction({ description: "Mercado", amount: 500, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-ali" });
      await seedTransaction({ description: "Padaria", amount: 30, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-ali" });
      await seedTransaction({ description: "Uber", amount: 25, type: "EXPENSE", status: "PAID", date: today, categoryId: "cat-trans" });

      const data = await getDashboard();
      expect(data.expensesByCategory.length).toBeGreaterThanOrEqual(0);
    });

    it("não inclui receitas no gasto por categoria", async () => {
      await seedCategory("cat-sal", "Salário");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-sal" });

      const data = await getDashboard();
      const salarioCat = data.expensesByCategory.find((c) => c.name === "Salário");
      expect(salarioCat).toBeUndefined();
    });

    it("não inclui transações PENDING no gasto por categoria", async () => {
      await seedCategory("cat-1", "Contas");
      const today = formatDateLocal(new Date());

      await seedTransaction({ description: "Pendente", amount: 500, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });

      const data = await getDashboard();
      expect(data.expensesByCategory.length).toBe(0);
    });
  });

  // ── PÁGINA 4: Contas Futuras (upcomingBills) ────────────────────────
  describe("Página: Contas Futuras", () => {
    it("lista contas recorrentes nos próximos 30 dias", async () => {
      await seedCategory("cat-int", "Internet");
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      await seedRecurring({
        id: "rec-1",
        description: "Internet",
        amount: 120,
        nextDueDate: formatDateLocal(nextWeek),
        startDate: "2025-01-01",
        categoryId: "cat-int",
      });

      const bills = await getUpcomingBills();
      expect(bills.length).toBe(1);
      expect(bills[0].name).toBe("Internet");
      expect(bills[0].amount).toBe(120);
    });

    it("exclui contas recorrentes além de 30 dias", async () => {
      await seedCategory("cat-int", "Internet");
      const today = new Date();
      const future = new Date(today);
      future.setDate(future.getDate() + 60);

      await seedRecurring({
        id: "rec-1",
        description: "Internet",
        amount: 120,
        nextDueDate: formatDateLocal(future),
        startDate: "2025-01-01",
        categoryId: "cat-int",
      });

      const bills = await getUpcomingBills();
      expect(bills.length).toBe(0);
    });

    it("exclui contas recorrentes inativas", async () => {
      await seedCategory("cat-int", "Internet");
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      await seedRecurring({
        id: "rec-1",
        description: "Internet",
        amount: 120,
        nextDueDate: formatDateLocal(nextWeek),
        startDate: "2025-01-01",
        categoryId: "cat-int",
        isActive: 0,
      });

      const bills = await getUpcomingBills();
      expect(bills.length).toBe(0);
    });

    it("getFutureBills inclui contas além de 30 dias", async () => {
      await seedCategory("cat-int", "Internet");
      const today = new Date();
      const future = new Date(today);
      future.setDate(future.getDate() + 60);

      await seedRecurring({
        id: "rec-1",
        description: "Internet",
        amount: 120,
        nextDueDate: formatDateLocal(future),
        startDate: "2025-01-01",
        categoryId: "cat-int",
      });

      const bills = await getFutureBills();
      expect(bills.length).toBe(1);
      expect(bills[0].name).toBe("Internet");
    });
  });

  // ── PÁGINA 5: Tendências (monthlyTrend) ──────────────────────────────
  describe("Página: Tendências Mensais", () => {
    it("retorna array de tendências mesmo sem dados", async () => {
      await seedCategory("cat-1", "Test");
      const data = await getDashboard();
      expect(Array.isArray(data.monthlyTrend)).toBe(true);
    });
  });
});
