import { generateId, getDb } from "@/lib/db";
import type {
  Category,
  Frequency,
  PaymentMethod,
  RecurringTransaction,
  TransactionType,
} from "@/lib/types";
import { formatDateLocal } from "@/lib/utils";

type SQLiteDatabase = Awaited<ReturnType<typeof getDb>>;

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
  await db.withTransactionAsync(async () => {
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
    const row = await db.getFirstAsync<RecurringRow>(
      `${BASE_SELECT} WHERE r.id = ?`,
      [id]
    );
    if (!row) throw new Error("Failed to create recurring transaction");
    if (data.isActive !== false) {
      await generateRecurringInstances(db, row);
    }
  });
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

  const needsRegeneration =
    data.description !== undefined ||
    data.amount !== undefined ||
    data.type !== undefined ||
    data.frequency !== undefined ||
    data.startDate !== undefined ||
    data.endDate !== undefined ||
    data.nextDueDate !== undefined ||
    data.categoryId !== undefined ||
    data.paymentMethod !== undefined;

  await db.withTransactionAsync(async () => {
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

    if (needsRegeneration) {
      const row = await db.getFirstAsync<RecurringRow>(
        `${BASE_SELECT} WHERE r.id = ?`,
        [id]
      );
      if (row) {
        // Nova data ou frequência redefine o dia da série; senão preserva o atual
        const seriesChanged = data.nextDueDate !== undefined || data.frequency !== undefined;
        await generateRecurringInstances(db, row, seriesChanged ? row.next_due_date : undefined);
      }
    }
  });
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM transactions WHERE recurring_id = ? AND status IN ('PENDING', 'OVERDUE')`,
      [id]
    );
    await db.runAsync("DELETE FROM recurring_transactions WHERE id = ?", [id]);
  });
}

export async function toggleRecurringActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE recurring_transactions SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
      [isActive ? 1 : 0, id]
    );
    if (!isActive) {
      await db.runAsync(
        `DELETE FROM transactions WHERE recurring_id = ? AND status IN ('PENDING', 'OVERDUE')`,
        [id]
      );
    } else {
      const row = await db.getFirstAsync<RecurringRow>(
        `${BASE_SELECT} WHERE r.id = ?`,
        [id]
      );
      if (row) await generateRecurringInstances(db, row);
    }
  });
}

/**
 * n-ésima ocorrência calculada sempre a partir da data inicial (não da anterior),
 * para que um vencimento no dia 31 caia no último dia dos meses curtos e volte
 * ao dia 31 depois — em vez de deslizar para 03/03 e ficar no dia 3 para sempre.
 */
function nthOccurrence(startDate: string, frequency: Frequency, n: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  if (frequency === "WEEKLY") {
    return formatDateLocal(new Date(year, month - 1, day + 7 * n));
  }
  const targetYear = frequency === "YEARLY" ? year + n : year;
  const targetMonth = frequency === "MONTHLY" ? month - 1 + n : month - 1;
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  return formatDateLocal(new Date(targetYear, targetMonth, Math.min(day, lastDayOfMonth)));
}

/** Ocorrências da série ancorada em `anchor`, a partir de `from` (inclusive). */
function generateDates(
  anchor: string,
  frequency: Frequency,
  from: string,
  endDate?: string | null
): string[] {
  const dates: string[] = [];
  const maxInstances = 500;
  const effectiveEnd = endDate ?? nthOccurrence(from, "MONTHLY", 24);

  for (let n = 0; dates.length < maxInstances; n++) {
    const current = nthOccurrence(anchor, frequency, n);
    if (current > effectiveEnd) break;
    if (current >= from) dates.push(current);
  }
  return dates;
}

/**
 * Data que define o dia de vencimento da série. next_due_date pode estar
 * "achatado" (28/02 numa série do dia 31), então o dia vem do maior dia do mês
 * entre as parcelas ainda em aberto — ex.: 28/02 e 31/03 → dia 31.
 * nthOccurrence ajusta dias inexistentes (31/02 → 28/02).
 */
async function resolveSeriesAnchor(db: SQLiteDatabase, recurring: RecurringRow): Promise<string> {
  if (recurring.frequency === "WEEKLY") return recurring.next_due_date;
  const open = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM transactions WHERE recurring_id = ? AND status IN ('PENDING', 'OVERDUE')`,
    [recurring.id]
  );
  const dayOf = (date: string) => Number(date.slice(8, 10));
  const anchorDay = Math.max(dayOf(recurring.next_due_date), ...open.map((r) => dayOf(r.date)));
  return `${recurring.next_due_date.slice(0, 8)}${String(anchorDay).padStart(2, "0")}`;
}

/**
 * Regenera as parcelas em aberto da recorrência.
 * `anchor` força o dia de vencimento (usado quando o usuário muda a data ou a
 * frequência); se omitido, preserva o dia da série atual.
 */
async function generateRecurringInstances(
  db: SQLiteDatabase,
  recurring: RecurringRow,
  anchor?: string
): Promise<void> {
  const seriesAnchor = anchor ?? (await resolveSeriesAnchor(db, recurring));

  await db.runAsync(
    `DELETE FROM transactions WHERE recurring_id = ? AND status IN ('PENDING', 'OVERDUE')`,
    [recurring.id]
  );

  const dates = generateDates(
    seriesAnchor,
    recurring.frequency as Frequency,
    recurring.next_due_date,
    recurring.end_date
  );
  if (dates.length === 0) return;

  for (const date of dates) {
    await db.runAsync(
      `INSERT INTO transactions
        (id, description, amount, type, status, payment_method, date, notes, category_id, recurring_id, source)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'MANUAL')`,
      [
        generateId(),
        recurring.description,
        recurring.amount,
        recurring.type,
        recurring.payment_method,
        date,
        `Gerado pela recorrência`,
        recurring.category_id,
        recurring.id,
      ]
    );
  }
}

export async function processRecurringDue(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<RecurringRow>(
    `${BASE_SELECT} WHERE r.is_active = 1`
  );

  for (const row of rows) {
    const next = await db.getFirstAsync<{ date: string | null }>(
      `SELECT MIN(date) as date FROM transactions WHERE recurring_id = ? AND status IN ('PENDING', 'OVERDUE')`,
      [row.id]
    );
    const nextDue = next?.date ?? row.next_due_date;
    if (nextDue && nextDue !== row.next_due_date) {
      await db.runAsync(
        "UPDATE recurring_transactions SET next_due_date = ?, updated_at = datetime('now') WHERE id = ?",
        [nextDue, row.id]
      );
    }
  }

  return 0;
}
