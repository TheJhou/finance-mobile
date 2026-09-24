import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb, resetDbCache } from "@/lib/db";
import { getDashboard } from "@/lib/repositories/dashboard";
import { createRecurring, processRecurringDue } from "@/lib/repositories/recurring";
import { parseNotification } from "@/lib/notifications/parsers";
import type { NotificationInput } from "@/lib/notifications/parsers";
import { formatDateLocal } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────

async function seedCategory(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
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
  frequency?: "WEEKLY" | "MONTHLY" | "YEARLY";
  type?: "INCOME" | "EXPENSE";
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurring_transactions
     (id, description, amount, type, frequency, next_due_date, start_date, category_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.description,
      data.amount,
      data.type ?? "EXPENSE",
      data.frequency ?? "MONTHLY",
      data.nextDueDate,
      data.startDate,
      data.categoryId,
      data.isActive ?? 1,
    ]
  );
}

// ── Regra 1: Transações ──────────────────────────────────────────────

describe("Regra de Negócio: Transações", () => {
  beforeEach(async () => {
    resetDbCache();
    resetMockDatabase();
  });

  it("INCOME aumenta o saldo", async () => {
    await seedCategory("cat-1", "Salário");
    await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-1" });

    const data = await getDashboard();
    expect(data.balance).toBe(3000);
    expect(data.monthlyIncome).toBe(3000);
    expect(data.monthlyExpense).toBe(0);
  });

  it("EXPENSE diminui o saldo", async () => {
    await seedCategory("cat-1", "Mercado");
    await seedTransaction({ description: "Mercado", amount: 500, type: "EXPENSE", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-1" });

    const data = await getDashboard();
    expect(data.balance).toBe(-500);
    expect(data.monthlyIncome).toBe(0);
    expect(data.monthlyExpense).toBe(500);
  });

  it("saldo = income - expense acumulado", async () => {
    await seedCategory("cat-sal", "Salário");
    await seedCategory("cat-mer", "Mercado");

    await seedTransaction({ description: "Salário", amount: 3000, type: "INCOME", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-sal" });
    await seedTransaction({ description: "Mercado", amount: 800, type: "EXPENSE", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-mer" });
    await seedTransaction({ description: "Aluguel", amount: 1200, type: "EXPENSE", status: "PAID", date: formatDateLocal(new Date()), categoryId: "cat-mer" });

    const data = await getDashboard();
    expect(data.balance).toBe(1000); // 3000 - 800 - 1200
    expect(data.monthlyIncome).toBe(3000);
    expect(data.monthlyExpense).toBe(2000);
  });

  it("transações PENDING não afetam o saldo", async () => {
    await seedCategory("cat-1", "Contas");
    const today = formatDateLocal(new Date());

    await seedTransaction({ description: "Recebido", amount: 2000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });
    await seedTransaction({ description: "Pendente", amount: 500, type: "EXPENSE", status: "PENDING", date: today, categoryId: "cat-1" });

    const data = await getDashboard();
    expect(data.balance).toBe(2000);
    expect(data.monthlyIncome).toBe(2000);
    expect(data.monthlyExpense).toBe(0);
    expect(data.pendingCount).toBe(1);
  });

  it("transações de meses anteriores não entram no mensal", async () => {
    await seedCategory("cat-1", "Salário");
    const today = formatDateLocal(new Date());
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    await seedTransaction({ description: "Salário atual", amount: 3000, type: "INCOME", status: "PAID", date: today, categoryId: "cat-1" });
    await seedTransaction({ description: "Salário passado", amount: 2500, type: "INCOME", status: "PAID", date: formatDateLocal(lastMonth), categoryId: "cat-1" });

    const data = await getDashboard();
    expect(data.monthlyIncome).toBe(3000);
    expect(data.monthlyExpense).toBe(0);
  });
});

// ── Regra 2: Recorrências ────────────────────────────────────────────

describe("Regra de Negócio: Recorrências", () => {
  beforeEach(async () => {
    resetDbCache();
    resetMockDatabase();
  });

  it("createRecurring gera contas PENDING vinculadas e processRecurringDue não as quita", async () => {
    await seedCategory("cat-1", "Internet");
    const today = formatDateLocal(new Date());

    await createRecurring({
      description: "Internet",
      amount: 100,
      type: "EXPENSE",
      frequency: "MONTHLY",
      startDate: today,
      nextDueDate: today,
      categoryId: "cat-1",
    });

    const created = await processRecurringDue();
    expect(created).toBe(0);

    const db = await getDb();
    const rows = await db.getAllAsync<{ amount: number; status: string; date: string }>(
      "SELECT amount, status, date FROM transactions WHERE description = 'Internet' ORDER BY date"
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].date).toBe(today);
    expect(rows[0].amount).toBe(100);
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
  });

  it("createRecurring não gera parcelas depois de end_date", async () => {
    await seedCategory("cat-1", "Internet");
    const start = new Date(2026, 0, 10);
    const end = new Date(2026, 2, 10);

    await createRecurring({
      description: "Internet",
      amount: 100,
      type: "EXPENSE",
      frequency: "MONTHLY",
      startDate: formatDateLocal(start),
      nextDueDate: formatDateLocal(start),
      endDate: formatDateLocal(end),
      categoryId: "cat-1",
    });

    const db = await getDb();
    const rows = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM transactions WHERE description = 'Internet' ORDER BY date"
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });
});

// ── Regra 3: Notificações Bancárias ─────────────────────────────────

describe("Regra de Negócio: Notificações Bancárias", () => {
  it("ignora notificações de marketing (fatura, saldo, promoção)", () => {
    expect(parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Sua fatura fecha amanhã", bigText: null, subText: null, postTime: Date.now() })).toBeNull();
    expect(parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Seu saldo atual é R$ 1.234,56", bigText: null, subText: null, postTime: Date.now() })).toBeNull();
    expect(parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Nova promoção disponível", bigText: null, subText: null, postTime: Date.now() })).toBeNull();
    expect(parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Você recebeu um cupom", bigText: null, subText: null, postTime: Date.now() })).toBeNull();
  });

  it("parseNotification retorna null para app desconhecido", () => {
    const result = parseNotification({ packageName: "com.whatsapp", title: "teste", text: "R$ 100,00", bigText: null, subText: null, postTime: Date.now() });
    expect(result).toBeNull();
  });

  it("parseNotification extrai valor, tipo e método de pagamento", () => {
    const result = parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Compra aprovada de R$ 150,00 em Supermercado", bigText: null, subText: null, postTime: Date.now() });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(150);
    expect(result!.type).toBe("EXPENSE");
    expect(result!.paymentMethod).toBe("CREDIT_CARD");
    expect(result!.bank).toBe("Nubank");
  });

  it("parseNotification classifica Pix recebido como INCOME", () => {
    const result = parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Você recebeu um Pix de R$ 300,00 de João Silva.", bigText: null, subText: null, postTime: Date.now() });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(300);
    expect(result!.type).toBe("INCOME");
    expect(result!.paymentMethod).toBe("PIX");
  });

  it("parseNotification classifica Pix enviado como EXPENSE", () => {
    const result = parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Pix enviado de R$ 50,00 para Maria.", bigText: null, subText: null, postTime: Date.now() });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(50);
    expect(result!.type).toBe("EXPENSE");
    expect(result!.paymentMethod).toBe("PIX");
  });

  it("parseNotification retorna null quando não encontra valor", () => {
    const result = parseNotification({ packageName: "com.nu.production", title: "Nubank", text: "Acesse o app para ver mais", bigText: null, subText: null, postTime: Date.now() });
    expect(result).toBeNull();
  });
});
