import { getDb } from "@/lib/db";
import { processRecurringDue } from "@/lib/repositories/recurring";
import type { DashboardData } from "@/lib/types";

export interface UpcomingBill {
  id: string;
  name: string;
  date: string;
  amount: number;
  color: string;
}

function monthRange(): { first: string; last: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return {
    first: formatDateLocal(first),
    last: formatDateLocal(last),
  };
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getDashboard(): Promise<DashboardData> {
  await processRecurringDue();
  const db = await getDb();
  const { first, last } = monthRange();
  const today = formatDateLocal(new Date());
  const in7Days = formatDateLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const balanceRow = await db.getFirstAsync<{ balance: number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as balance
     FROM transactions WHERE status = 'PAID' AND date BETWEEN ? AND ?`,
    [first, last]
  );

  const incomeRow = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE type = 'INCOME' AND status = 'PAID' AND date BETWEEN ? AND ?`,
    [first, last]
  );

  const expenseRow = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE type = 'EXPENSE' AND status = 'PAID' AND date BETWEEN ? AND ?`,
    [first, last]
  );

  const pendingRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'`
  );

  const overdueRow = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE status = 'PENDING' AND date < ?`,
    [today]
  );

  const upcomingRow = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE status = 'PENDING' AND date >= ? AND date <= ?`,
    [today, in7Days]
  );

  const recurringRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM recurring_transactions WHERE is_active = 1`
  );

  const byCategory = await db.getAllAsync<{
    name: string;
    color: string;
    total: number;
  }>(
    `SELECT c.name, c.color, SUM(t.amount) as total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'EXPENSE' AND t.status = 'PAID' AND t.date BETWEEN ? AND ?
     GROUP BY c.id, c.name, c.color
     ORDER BY total DESC`,
    [first, last]
  );

  // Monthly trend: last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const trendRows = await db.getAllAsync<{
    month: string;
    income: number;
    expense: number;
  }>(
    `SELECT strftime('%Y-%m', date) as month,
       SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
       SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
     FROM transactions
     WHERE status = 'PAID' AND date >= ?
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [formatDateLocal(sixMonthsAgo)]
  );

  return {
    balance: balanceRow?.balance ?? 0,
    monthlyIncome: incomeRow?.total ?? 0,
    monthlyExpense: expenseRow?.total ?? 0,
    pendingCount: pendingRow?.count ?? 0,
    overdueAmount: overdueRow?.total ?? 0,
    upcomingAmount: upcomingRow?.total ?? 0,
    activeRecurring: recurringRow?.count ?? 0,
    expensesByCategory: byCategory.map((r) => ({
      name: r.name,
      color: r.color,
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

export async function getUpcomingBills(): Promise<UpcomingBill[]> {
  const db = await getDb();
  const today = formatDateLocal(new Date());
  const in30Days = formatDateLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

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
    [today, in30Days]
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
