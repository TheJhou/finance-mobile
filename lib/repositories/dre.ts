import { getDb } from "@/lib/db";
import { processRecurringDue } from "@/lib/repositories/recurring";
import { formatDateLocal } from "@/lib/utils";

export type DrePeriod = "month" | "quarter" | "semester" | "year" | "custom";

export interface DrePeriodRange {
  type: DrePeriod;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label: string;
}

export interface DreCategoryRow {
  categoryName: string;
  categoryColor: string;
  total: number;
}

export interface DreMonthlyRow {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  result: number;
}

export interface DreData {
  period: DrePeriodRange;
  totalIncome: number;
  totalExpense: number;
  netResult: number;
  incomeByCategory: DreCategoryRow[];
  expenseByCategory: DreCategoryRow[];
  monthlyEvolution: DreMonthlyRow[];
  transactions: DreTransaction[];
}

export interface DreTransaction {
  id: string;
  date: string;
  description: string;
  categoryName: string;
  categoryColor: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  paymentMethod: string;
  status: string;
}

// ─── Period helpers ───────────────────────────────────────────────────────────

const MONTH_NAMES_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function buildPeriodRange(
  type: DrePeriod,
  customFrom?: string,
  customTo?: string,
  opts?: { year?: number; month?: number; monthStartDay?: number },
): DrePeriodRange {
  const now = new Date();
  const y = opts?.year ?? now.getFullYear();
  const m = opts?.month ?? now.getMonth();
  const startDay = opts?.monthStartDay ?? 1;

  function customMonthRange(year: number, month: number): { from: string; to: string } {
    if (startDay === 1) {
      return {
        from: formatDateLocal(new Date(year, month, 1)),
        to: formatDateLocal(new Date(year, month + 1, 0)),
      };
    }
    return {
      from: formatDateLocal(new Date(year, month, startDay)),
      to: formatDateLocal(new Date(year, month + 1, startDay - 1)),
    };
  }

  switch (type) {
    case "month": {
      const { from, to } = customMonthRange(y, m);
      return { type, from, to, label: `${MONTH_NAMES_SHORT[m]} ${y}` };
    }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const { from: qFrom } = customMonthRange(y, qStart);
      const { to: qTo } = customMonthRange(y, qStart + 2);
      return { type, from: qFrom, to: qTo, label: `${Math.floor(m / 3) + 1}º Trim. ${y}` };
    }
    case "semester": {
      const sStart = m < 6 ? 0 : 6;
      const { from: sFrom } = customMonthRange(y, sStart);
      const { to: sTo } = customMonthRange(y, sStart + 5);
      return { type, from: sFrom, to: sTo, label: `${sStart === 0 ? "1º" : "2º"} Sem. ${y}` };
    }
    case "year": {
      const { from } = customMonthRange(y, 0);
      const { to } = customMonthRange(y, 11);
      return { type, from, to, label: `Ano ${y}` };
    }
    case "custom": {
      const from = customFrom ?? formatDateLocal(new Date(y, m, 1));
      const to = customTo ?? formatDateLocal(new Date(y, m + 1, 0));
      return { type, from, to, label: `${from} → ${to}` };
    }
  }
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getDreData(period: DrePeriodRange): Promise<DreData> {
  await processRecurringDue();
  const db = await getDb();
  const { from, to } = period;

  // Totals
  const totalsRow = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as expense
     FROM transactions
     WHERE status = 'PAID' AND date BETWEEN ? AND ?`,
    [from, to]
  );

  const totalIncome = totalsRow?.income ?? 0;
  const totalExpense = totalsRow?.expense ?? 0;

  // Income by category
  const incomeRows = await db.getAllAsync<{ name: string; color: string; total: number }>(
    `SELECT c.name, c.color, SUM(t.amount) as total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'INCOME' AND t.status = 'PAID' AND t.date BETWEEN ? AND ?
     GROUP BY c.id, c.name, c.color
     ORDER BY total DESC`,
    [from, to]
  );

  // Expense by category
  const expenseRows = await db.getAllAsync<{ name: string; color: string; total: number }>(
    `SELECT c.name, c.color, SUM(t.amount) as total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'EXPENSE' AND t.status = 'PAID' AND t.date BETWEEN ? AND ?
     GROUP BY c.id, c.name, c.color
     ORDER BY total DESC`,
    [from, to]
  );

  // Monthly evolution within period
  const monthlyRows = await db.getAllAsync<{ month: string; income: number; expense: number }>(
    `SELECT strftime('%Y-%m', date) as month,
       SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
       SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
     FROM transactions
     WHERE status = 'PAID' AND date BETWEEN ? AND ?
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [from, to]
  );

  // Detailed transactions
  const txRows = await db.getAllAsync<{
    id: string;
    date: string;
    description: string;
    category_name: string | null;
    category_color: string | null;
    type: string;
    amount: number;
    payment_method: string;
    status: string;
  }>(
    `SELECT t.id, t.date, t.description, c.name as category_name, c.color as category_color,
            t.type, t.amount, t.payment_method, t.status
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.status = 'PAID' AND t.date BETWEEN ? AND ?
     ORDER BY t.date DESC, t.created_at DESC`,
    [from, to]
  );

  return {
    period,
    totalIncome,
    totalExpense,
    netResult: totalIncome - totalExpense,
    incomeByCategory: incomeRows.map((r) => ({
      categoryName: r.name ?? "Sem categoria",
      categoryColor: r.color ?? "#6366f1",
      total: r.total,
    })),
    expenseByCategory: expenseRows.map((r) => ({
      categoryName: r.name ?? "Sem categoria",
      categoryColor: r.color ?? "#6366f1",
      total: r.total,
    })),
    monthlyEvolution: monthlyRows.map((r) => ({
      month: r.month,
      income: r.income,
      expense: r.expense,
      result: r.income - r.expense,
    })),
    transactions: txRows.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      categoryName: r.category_name ?? "Sem categoria",
      categoryColor: r.category_color ?? "#6366f1",
      type: r.type as "INCOME" | "EXPENSE",
      amount: r.amount,
      paymentMethod: r.payment_method,
      status: r.status,
    })),
  };
}
