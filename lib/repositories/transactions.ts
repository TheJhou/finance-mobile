import { generateId, getDb } from "@/lib/db";
import { formatDateLocal } from "@/lib/utils";
import type {
    Category,
    DocumentType,
    PaymentMethod,
    Transaction,
    TransactionSource,
    TransactionStatus,
    TransactionType,
} from "@/lib/types";

interface TransactionRow {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  date: string;
  notes: string | null;
  category_id: string;
  boleto_number: string | null;
  cnpj: string | null;
  recipient_name: string | null;
  document_type: DocumentType;
  recurring_id: string | null;
  source: TransactionSource;
  bank_origin: string | null;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  category_is_default: number | null;
}

function mapTransaction(row: TransactionRow): Transaction {
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
    status: row.status,
    paymentMethod: row.payment_method,
    date: row.date,
    notes: row.notes,
    categoryId: row.category_id,
    category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documentType: row.document_type,
    boletoNumber: row.boleto_number,
    cnpj: row.cnpj,
    recipientName: row.recipient_name,
    recurringId: row.recurring_id,
    source: row.source ?? "MANUAL",
    bankOrigin: row.bank_origin,
  };
}

const BASE_SELECT = `
  SELECT
    t.id, t.description, t.amount, t.type, t.status, t.payment_method,
    t.date, t.notes, t.category_id, t.boleto_number, t.cnpj, t.recipient_name, t.document_type,
    t.recurring_id, t.source, t.bank_origin,
    t.created_at, t.updated_at,
    c.name as category_name, c.color as category_color,
    c.icon as category_icon, c.is_default as category_is_default
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow>(
    `${BASE_SELECT} ORDER BY t.date DESC, t.created_at DESC LIMIT 500`
  );
  return rows.map(mapTransaction);
}

export async function listTransactionsPaginated(opts?: {
  limit?: number;
  offset?: number;
}): Promise<Transaction[]> {
  const db = await getDb();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const rows = await db.getAllAsync<TransactionRow>(
    `${BASE_SELECT} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows.map(mapTransaction);
}

export async function getTransaction(
  id: string
): Promise<Transaction | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow>(
    `${BASE_SELECT} WHERE t.id = ?`,
    [id]
  );
  const row = rows[0] || null;
  return row ? mapTransaction(row) : null;
}

export async function createTransaction(data: {
  description: string;
  amount: number;
  type: TransactionType;
  status?: TransactionStatus;
  paymentMethod?: PaymentMethod;
  date: string;
  notes?: string | null;
  categoryId: string;
  documentType?: DocumentType;
  boletoNumber?: string | null;
  cnpj?: string | null;
  recipientName?: string | null;
  recurringId?: string | null;
  source?: TransactionSource;
  bankOrigin?: string | null;
}): Promise<Transaction> {
  const db = await getDb();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO transactions
      (id, description, amount, type, status, payment_method, date, notes, category_id, document_type, boleto_number, cnpj, recipient_name, recurring_id, source, bank_origin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.description,
      data.amount,
      data.type,
      data.status ?? "PAID",
      data.paymentMethod ?? "CASH",
      data.date,
      data.notes ?? null,
      data.categoryId,
      data.documentType ?? "NORMAL",
      data.boletoNumber ?? null,
      data.cnpj ?? null,
      data.recipientName ?? null,
      data.recurringId ?? null,
      data.source ?? "MANUAL",
      data.bankOrigin ?? null,
    ]
  );
  const created = await getTransaction(id);
  if (!created) throw new Error("Failed to create transaction");
  return created;
}

export async function updateTransaction(
  id: string,
  data: Partial<{
    description: string;
    amount: number;
    type: TransactionType;
    status: TransactionStatus;
    paymentMethod: PaymentMethod;
    date: string;
    notes: string | null;
    categoryId: string;
    documentType: DocumentType;
    boletoNumber: string | null;
    cnpj: string | null;
    recipientName: string | null;
  }>
): Promise<void> {
  const db = await getDb();
  const map: Record<string, string> = {
    description: "description",
    amount: "amount",
    type: "type",
    status: "status",
    paymentMethod: "payment_method",
    date: "date",
    notes: "notes",
    categoryId: "category_id",
    documentType: "document_type",
    boletoNumber: "boleto_number",
    cnpj: "cnpj",
    recipientName: "recipient_name",
    source: "source",
    bankOrigin: "bank_origin",
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      params.push(value as string | number | null);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  await db.runAsync(
    `UPDATE transactions SET ${sets.join(", ")} WHERE id = ?`,
    params as (string | number | null)[]
  );

  // Vencimento adiado para hoje ou depois: deixa de estar vencida.
  // (O caminho inverso é feito por markOverdueTransactions.)
  if (data.date !== undefined && data.status === undefined) {
    await db.runAsync(
      `UPDATE transactions SET status = 'PENDING' WHERE id = ? AND status = 'OVERDUE' AND date >= ?`,
      [id, formatDateLocal(new Date())]
    );
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM transactions WHERE id = ?", [id]);
}

export async function markAsPaid(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE transactions SET status = 'PAID', updated_at = datetime('now') WHERE id = ?`,
    [id]
  );
}

export async function markOverdueTransactions(): Promise<void> {
  const db = await getDb();
  const today = formatDateLocal(new Date());
  await db.runAsync(
    `UPDATE transactions SET status = 'OVERDUE', updated_at = datetime('now')
     WHERE status = 'PENDING' AND date < ?`,
    [today]
  );
}
