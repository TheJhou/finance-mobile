import { generateId, getDb } from "@/lib/db";
import type {
    Category,
    Frequency,
    PaymentMethod,
    RecurringTransaction,
    TransactionType,
} from "@/lib/types";

interface RecurringRow {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  frequency: Frequency;
  payment_method: PaymentMethod;
  is_active: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  category_id: string;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  category_is_default: number | null;
}

function mapRecurring(row: RecurringRow): RecurringTransaction {
  const category: Category | undefined = row.category_name
    ? {
        id: row.category_id,
        name: row.category_name,
        color: row.category_color ?? "#6366f1",
        icon: row.category_icon ?? "tag",
        isDefault: (row.category_is_default ?? 0) === 1,
      }
    : undefined;
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    type: row.type,
    frequency: row.frequency,
    paymentMethod: row.payment_method,
    isActive: row.is_active === 1,
    startDate: row.start_date,
    endDate: row.end_date,
    nextDueDate: row.next_due_date,
    categoryId: row.category_id,
    category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_SELECT = `
  SELECT
    r.id, r.description, r.amount, r.type, r.frequency, r.payment_method,
    r.is_active, r.start_date, r.end_date, r.next_due_date,
    r.category_id, r.created_at, r.updated_at,
    c.name as category_name, c.color as category_color,
    c.icon as category_icon, c.is_default as category_is_default
  FROM recurring_transactions r
  LEFT JOIN categories c ON c.id = r.category_id
`;

export async function listRecurring(): Promise<RecurringTransaction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecurringRow>(
    `${BASE_SELECT} ORDER BY r.is_active DESC, r.next_due_date ASC`
  );
  return rows.map(mapRecurring);
}

export async function getRecurring(
  id: string
): Promise<RecurringTransaction | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<RecurringRow>(
    `${BASE_SELECT} WHERE r.id = ?`,
    [id]
  );
  return row ? mapRecurring(row) : null;
}

export async function createRecurring(data: {
  description: string;
  amount: number;
  type: TransactionType;
  frequency: Frequency;
  paymentMethod?: PaymentMethod;
  isActive?: boolean;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  categoryId: string;
}): Promise<RecurringTransaction> {
  const db = await getDb();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO recurring_transactions
      (id, description, amount, type, frequency, payment_method, is_active,
       start_date, end_date, next_due_date, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.description,
      data.amount,
      data.type,
      data.frequency,
      data.paymentMethod ?? "CASH",
      data.isActive === false ? 0 : 1,
      data.startDate,
      data.endDate ?? null,
      data.nextDueDate,
      data.categoryId,
    ]
  );
  const created = await getRecurring(id);
  if (!created) throw new Error("Failed to create recurring transaction");
  return created;
}

export async function updateRecurring(
  id: string,
  data: Partial<{
    description: string;
    amount: number;
    type: TransactionType;
    frequency: Frequency;
    paymentMethod: PaymentMethod;
    isActive: boolean;
    startDate: string;
    endDate: string | null;
    nextDueDate: string;
    categoryId: string;
  }>
): Promise<void> {
  const db = await getDb();
  const map: Record<string, string> = {
    description: "description",
    amount: "amount",
    type: "type",
    frequency: "frequency",
    paymentMethod: "payment_method",
    isActive: "is_active",
    startDate: "start_date",
    endDate: "end_date",
    nextDueDate: "next_due_date",
    categoryId: "category_id",
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      if (key === "isActive") {
        params.push(value ? 1 : 0);
      } else {
        params.push(value as string | number | null);
      }
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  await db.runAsync(
    `UPDATE recurring_transactions SET ${sets.join(", ")} WHERE id = ?`,
    params as (string | number | null)[]
  );
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM recurring_transactions WHERE id = ?", [id]);
}

export async function toggleRecurringActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE recurring_transactions SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    [isActive ? 1 : 0, id]
  );
}

function advanceDate(date: string, frequency: Frequency): string {
  const d = new Date(date + "T00:00:00");
  switch (frequency) {
    case "WEEKLY":
      d.setDate(d.getDate() + 7);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function processRecurringDue(): Promise<number> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  const dueRows = await db.getAllAsync<RecurringRow>(
    `${BASE_SELECT} WHERE r.is_active = 1 AND r.next_due_date <= ?`,
    [today]
  );

  let created = 0;

  for (const row of dueRows) {
    let dueDate = row.next_due_date;

    while (dueDate <= today) {
      const txId = generateId();
      await db.runAsync(
        `INSERT INTO transactions
          (id, description, amount, type, status, payment_method, date, notes, category_id)
         VALUES (?, ?, ?, ?, 'PAID', ?, ?, ?, ?)`,
        [
          txId,
          row.description,
          row.amount,
          row.type,
          row.payment_method,
          dueDate,
          `Gerada automaticamente (recorrente)`,
          row.category_id,
        ]
      );
      created++;

      dueDate = advanceDate(dueDate, row.frequency as Frequency);

      if (row.end_date && dueDate > row.end_date) {
        await db.runAsync(
          "UPDATE recurring_transactions SET is_active = 0, next_due_date = ?, updated_at = datetime('now') WHERE id = ?",
          [dueDate, row.id]
        );
        break;
      }
    }

    if (!row.end_date || dueDate <= row.end_date) {
      await db.runAsync(
        "UPDATE recurring_transactions SET next_due_date = ?, updated_at = datetime('now') WHERE id = ?",
        [dueDate, row.id]
      );
    }
  }

  return created;
}
