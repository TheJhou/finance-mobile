import { autoSaveTransaction } from "@/lib/backend";
import { generateId, getDb } from "@/lib/db";

export const MAX_SYNC_RETRIES = 5;

export interface SyncQueueItem {
  id: string;
  transactionId: string;
  payload: string;
  createdAt: string;
  retryCount: number;
  lastAttempt: string | null;
  status: "PENDING" | "SYNCED" | "FAILED";
}

interface SyncQueueRow {
  id: string;
  transaction_id: string;
  payload: string;
  created_at: string;
  retry_count: number;
  last_attempt: string | null;
  status: "PENDING" | "SYNCED" | "FAILED";
}

function rowToItem(row: SyncQueueRow): SyncQueueItem {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    payload: row.payload,
    createdAt: row.created_at,
    retryCount: row.retry_count ?? 0,
    lastAttempt: row.last_attempt ?? null,
    status: row.status,
  };
}

export interface SyncPayload {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  paymentMethod?: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER" | "BOLETO" | "MERCADO_PAGO" | "CASH" | "OTHER";
  date: string;
  categoryId?: string;
  notes?: string;
  source?: "TEXT" | "DOCUMENT" | "AUDIO" | "PHOTO" | "VOICE" | "BANK_NOTIFICATION";
}

/**
 * Enfileira uma transação para sync com o backend.
 */
export async function enqueueSync(
  transactionId: string,
  payload: SyncPayload
): Promise<string> {
  const db = await getDb();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO sync_queue (id, transaction_id, payload, status)
     VALUES (?, ?, ?, 'PENDING')`,
    [id, transactionId, JSON.stringify(payload)]
  );
  return id;
}

/**
 * Retorna itens PENDING da sync_queue com retry_count < MAX_SYNC_RETRIES.
 */
export async function getPendingSyncItems(limit = 5): Promise<SyncQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue
     WHERE status = 'PENDING'
       AND retry_count < ?
       AND (
         last_attempt IS NULL
         OR datetime(last_attempt) < datetime('now', '-1 minute')
       )
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_SYNC_RETRIES, limit]
  );
  return rows.map(rowToItem);
}

/**
 * Marca um item como sincronizado com sucesso.
 */
export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'SYNCED', last_attempt = datetime('now') WHERE id = ?`,
    [id]
  );
}

/**
 * Incrementa retry count. Se exceder MAX_SYNC_RETRIES, marca como FAILED.
 */
export async function incrementSyncRetry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue
     SET retry_count = retry_count + 1,
         last_attempt = datetime('now'),
         status = CASE WHEN retry_count + 1 >= ? THEN 'FAILED' ELSE status END
     WHERE id = ?`,
    [MAX_SYNC_RETRIES, id]
  );
}

/**
 * Processa a fila de sync. Deve ser chamado quando online.
 */
export async function processSyncQueue(): Promise<void> {
  const items = await getPendingSyncItems(5);
  if (items.length === 0) return;

  console.log(`[SyncQueue] Processando ${items.length} itens pendentes`);

  for (const item of items) {
    try {
      const payload: SyncPayload = JSON.parse(item.payload);
      await autoSaveTransaction(payload);
      await markSynced(item.id);
      console.log(`[SyncQueue] Item ${item.id} sincronizado com sucesso`);
    } catch (err) {
      console.warn(
        `[SyncQueue] Falha ao sincronizar item ${item.id}:`,
        err instanceof Error ? err.message : err
      );
      await incrementSyncRetry(item.id);
    }
  }
}

/**
 * Conta itens pendentes na sync_queue.
 */
export async function countPendingSync(): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'`
  );
  return result?.count ?? 0;
}
