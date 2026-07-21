import { getDb } from "@/lib/db";
import { processRecurringDue } from "@/lib/repositories/recurring";
import { getCachedMonthStartDay } from "@/lib/settings";
import type { DashboardData } from "@/lib/types";
import { formatDateLocal } from "@/lib/utils";

export interface UpcomingBill {
  id: string;
  name: string;
  date: string;
  amount: number;
  color: string;
}

function monthRange(year?: number, month?: number, monthStartDay?: number): { first: string; last: string } {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth();
  const startDay = monthStartDay ?? getCachedMonthStartDay();

  if (startDay === 1) {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0, 23, 59, 59);
    return {
      first: formatDateLocal(first),
      last: formatDateLocal(last),
    };
  }

  // Custom start day: month "m" runs from day `startDay` of month m to day `startDay-1` of month m+1
  const first = new Date(y, m, startDay);
  const last = new Date(y, m + 1, startDay - 1, 23, 59, 59);
  return {
    first: formatDateLocal(first),
    last: formatDateLocal(last),
  };
}

export async function getDashboard(opts?: { year?: number; month?: number; monthStartDay?: number }): Promise<DashboardData> {
  try {
    await processRecurringDue();
  } catch (err) {
    console.warn("[Dashboard] processRecurringDue failed:", err);
  }
  const db = await getDb();
  const startDay = opts?.monthStartDay ?? getCachedMonthStartDay();
  const { first, last } = monthRange(opts?.year, opts?.month, startDay);
  const { first: prevFirst, last: prevLast } = monthRange(
    opts?.year,
    (opts?.month ?? new Date().getMonth()) - 1,
    startDay
  );
  const today = formatDateLocal(new Date());
  const in7Days = formatDateLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  // For filtered month, overdue = pending transactions with date < first day of selected month
  // and upcoming = pending transactions within the selected month
  const isCurrentMonth = !opts?.year || !opts?.month
    ? true
    : (opts.year === new Date().getFullYear() && opts.month === new Date().getMonth());

  const overdueDate = isCurrentMonth ? today : first;
  const upcomingStart = isCurrentMonth ? today : first;
  const upcomingEnd = isCurrentMonth ? in7Days : last;

  // Monthly trend: 6 months ending at the selected month (respecting monthStartDay)
  const trendStart = formatDateLocal(new Date(
    (opts?.year ?? new Date().getFullYear()),
    (opts?.month ?? new Date().getMonth()) - 5,
    startDay
  ));
  // Shift days so strftime groups by custom month period (e.g. day 5 → 1st of that period's month)
  const trendShift = startDay - 1;

  const [
    balanceRow, incomeRow, expenseRow, pendingRow,
    overdueRow, upcomingRow, recurringRow, byCategory,
    expenseTrendRows, trendRows,
    receivablesRow, payablesRow, prevReceivablesRow, prevPayablesRow
  ] = await Promise.all([
    db.getFirstAsync<{ balance: number | null }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as balance
       FROM transactions WHERE status = 'PAID' AND date <= ?`,
      [last]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'INCOME' AND status = 'PAID' AND date BETWEEN ? AND ?`,
      [first, last]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'EXPENSE' AND status = 'PAID' AND date BETWEEN ? AND ?`,
      [first, last]
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING' AND date BETWEEN ? AND ?`,
      [first, last]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE status = 'PENDING' AND date < ?`,
      [overdueDate]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE status = 'PENDING' AND date >= ? AND date <= ?`,
      [upcomingStart, upcomingEnd]
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM recurring_transactions WHERE is_active = 1`
    ),
    db.getAllAsync<{ name: string; color: string; total: number }>(
      `SELECT c.name, c.color, SUM(t.amount) as total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'EXPENSE' AND t.status = 'PAID' AND t.date BETWEEN ? AND ?
       GROUP BY c.id, c.name, c.color
       ORDER BY total DESC`,
      [first, last]
    ),
    db.getAllAsync<{ day: string; total: number }>(
      `SELECT substr(date, 9, 2) as day, COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE type = 'EXPENSE' AND status = 'PAID' AND date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date ASC`,
      [first, last]
    ),
    db.getAllAsync<{ month: string; income: number; expense: number }>(
      `SELECT strftime('%Y-%m', date(date, '-' || ? || ' days')) as month,
         SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
         SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
       FROM transactions
       WHERE status = 'PAID' AND date >= ?
       GROUP BY strftime('%Y-%m', date(date, '-' || ? || ' days'))
       ORDER BY month ASC`,
      [trendShift, trendStart, trendShift]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'INCOME' AND status IN ('PENDING', 'OVERDUE') AND date BETWEEN ? AND ?`,
      [first, last]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'EXPENSE' AND status IN ('PENDING', 'OVERDUE') AND date BETWEEN ? AND ?`,
      [first, last]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'INCOME' AND status IN ('PENDING', 'OVERDUE') AND date BETWEEN ? AND ?`,
      [prevFirst, prevLast]
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE type = 'EXPENSE' AND status IN ('PENDING', 'OVERDUE') AND date BETWEEN ? AND ?`,
      [prevFirst, prevLast]
    ),
  ]);

  return {
    balance: balanceRow?.balance ?? 0,
    monthlyIncome: incomeRow?.total ?? 0,
    monthlyExpense: expenseRow?.total ?? 0,
    pendingCount: pendingRow?.count ?? 0,
    overdueAmount: overdueRow?.total ?? 0,
    upcomingAmount: upcomingRow?.total ?? 0,
    activeRecurring: recurringRow?.count ?? 0,
    pendingReceivables: receivablesRow?.total ?? 0,
    pendingPayables: payablesRow?.total ?? 0,
    prevPendingReceivables: prevReceivablesRow?.total ?? 0,
    prevPendingPayables: prevPayablesRow?.total ?? 0,
    expensesByCategory: byCategory.map((r) => ({
      name: r.name,
      color: r.color,
      value: r.total,
    })),
    expenseTrend: expenseTrendRows.map((r) => ({
      label: r.day,
      value: r.total,
    })),
    monthlyTrend: trendRows.map((r) => ({
      month: r.month,
      income: r.income,
      expense: r.expense,
    })),
    evolution: [],
  };
}

export async function getUpcomingBills(opts?: { year?: number; month?: number; monthStartDay?: number }): Promise<UpcomingBill[]> {
  const db = await getDb();
  const today = formatDateLocal(new Date());
  const in30Days = formatDateLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const isCurrentMonth = !opts?.year || !opts?.month
    ? true
    : (opts.year === new Date().getFullYear() && opts.month === new Date().getMonth());

  const { first, last } = monthRange(opts?.year, opts?.month, opts?.monthStartDay);
  const startDate = isCurrentMonth ? today : first;
  const endDate = isCurrentMonth ? in30Days : last;

  const rows = await db.getAllAsync<{
    id: string;
    description: string;
    next_due_date: string;
    amount: number;
    color: string;
  }>(
    `SELECT r.id, r.description, r.next_due_date, r.amount, c.color
     FROM recurring_transactions r
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.is_active = 1 AND r.next_due_date >= ? AND r.next_due_date <= ?
     ORDER BY r.next_due_date ASC
     LIMIT 6`,
    [startDate, endDate]
  );

  return rows.map((r) => {
    const d = new Date(r.next_due_date + "T00:00:00");
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return {
      id: r.id,
      name: r.description,
      date: `${d.getDate()} ${months[d.getMonth()]}`,
      amount: r.amount,
      color: r.color || "#6366f1",
    };
  });
}

export async function getOverdueTransactions(): Promise<{ id: string; description: string; amount: number; date: string }[]> {
  const db = await getDb();
  const today = formatDateLocal(new Date());
  const rows = await db.getAllAsync<{ id: string; description: string; amount: number; date: string }>(
    `SELECT id, description, amount, date FROM transactions WHERE status = 'PENDING' AND date < ? ORDER BY date ASC LIMIT 10`,
    [today]
  );
  return rows;
}
