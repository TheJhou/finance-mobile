import { getDb } from "@/lib/db";
import type { DashboardData } from "@/lib/types";

function monthRange(): { first: string; last: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return {
    first: first.toISOString().slice(0, 10),
    last: last.toISOString().slice(0, 10),
  };
}

export async function getDashboard(): Promise<DashboardData> {
  const db = await getDb();
  const { first, last } = monthRange();
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const balanceRow = await db.getFirstAsync<{ balance: number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as balance
     FROM transactions WHERE status = 'PAID'`
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
    monthlyTrend: [],
    evolution: [],
  };
}
