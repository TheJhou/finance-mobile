import { getDb } from "@/lib/db";
import { processRecurringDue } from "@/lib/repositories/recurring";
import { formatDateLocal } from "@/lib/utils";

export type DrePeriod = "month" | "quarter" | "semester" | "year" | "custom" | "months";

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
    // "months" (intervalo) é montado por buildMonthRange; aqui equivale a um mês
    case "months":
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

// ─── Intervalo de meses (filtro único do Relatório) ──────────────────────────

/** Mês financeiro de referência. `month` é 0-based, como em Date. */
export interface MonthRef {
  year: number;
  month: number;
}

export interface MonthRange {
  start: MonthRef;
  end: MonthRef;
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const date = new Date(ref.year, ref.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Diferença em meses (b - a). */
export function monthDiff(a: MonthRef, b: MonthRef): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Quantidade de meses no intervalo, contando os dois extremos. */
export function monthCount(range: MonthRange): number {
  return monthDiff(range.start, range.end) + 1;
}

/** Aceita os meses em qualquer ordem. */
export function toMonthRange(a: MonthRef, b: MonthRef = a): MonthRange {
  return monthDiff(a, b) >= 0 ? { start: a, end: b } : { start: b, end: a };
}

/** Anda o intervalo inteiro pelo próprio tamanho (3 meses → próximos 3). */
export function shiftMonthRange(range: MonthRange, direction: 1 | -1): MonthRange {
  const step = monthCount(range) * direction;
  return { start: shiftMonth(range.start, step), end: shiftMonth(range.end, step) };
}

export function formatMonthRangeLabel(range: MonthRange): string {
  const { start, end } = range;
  const startLabel = MONTH_NAMES_SHORT[start.month];
  const endLabel = `${MONTH_NAMES_SHORT[end.month]} ${end.year}`;
  if (monthDiff(start, end) === 0) return endLabel;
  if (start.year === end.year) return `${startLabel} – ${endLabel}`;
  return `${startLabel} ${start.year} – ${endLabel}`;
}

/**
 * Datas do intervalo respeitando o dia de início do mês financeiro:
 * com início no dia 5, "Jul – Set" vai de 05/07 a 04/10.
 */
export function buildMonthRange(range: MonthRange, monthStartDay = 1): DrePeriodRange {
  const { start, end } = toMonthRange(range.start, range.end);
  const startDay = Math.min(Math.max(monthStartDay, 1), 28);
  const from = new Date(start.year, start.month, startDay);
  const to = new Date(end.year, end.month + 1, startDay - 1);
  return {
    type: "months",
    from: formatDateLocal(from),
    to: formatDateLocal(to),
    label: formatMonthRangeLabel({ start, end }),
  };
}

export type MonthRangePreset = "current" | "last3" | "last6" | "yearToDate";

/** Atalhos do seletor, calculados a partir do mês financeiro atual. */
export function monthRangePreset(preset: MonthRangePreset, current: MonthRef): MonthRange {
  switch (preset) {
    case "current":
      return { start: current, end: current };
    case "last3":
      return { start: shiftMonth(current, -2), end: current };
    case "last6":
      return { start: shiftMonth(current, -5), end: current };
    case "yearToDate":
      return { start: { year: current.year, month: 0 }, end: current };
  }
}

// ─── Main query ───────────────────────────────────────────────────────────────

export async function getDreData(period: DrePeriodRange): Promise<DreData> {
  try {
    await processRecurringDue();
  } catch (err) {
    console.warn("[DRE] processRecurringDue failed:", err);
  }
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

  // Evolução por mês financeiro: com início no dia 5, 05/07–04/08 conta como
  // julho (o período começa no dia de início; desloca as datas antes de agrupar)
  const startDayShift = Math.max(0, Number(from.slice(8, 10)) - 1);
  const monthlyRows = await db.getAllAsync<{ month: string; income: number; expense: number }>(
    `SELECT strftime('%Y-%m', date(date, '-' || ? || ' days')) as month,
       SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
       SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
     FROM transactions
     WHERE status = 'PAID' AND date BETWEEN ? AND ?
     GROUP BY month
     ORDER BY month ASC`,
    [startDayShift, from, to]
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
