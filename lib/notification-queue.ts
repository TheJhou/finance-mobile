import { generateId, getDb } from "@/lib/db";
import type { PaymentMethod, TransactionType } from "@/lib/types";

export type NotificationQueueStatus = "PENDING_AI" | "AI_PROCESSED" | "APPROVED" | "REJECTED";

export const MAX_AI_RETRIES = 3;
export const LOCK_STALE_MINUTES = 5;

export interface NotificationQueueItem {
  id: string;
  packageName: string;
  title: string;
  text: string;
  bigText: string | null;
  subText: string | null;
  postTime: number;
  rawText: string;
  createdAt: string;
  status: NotificationQueueStatus;
  aiEnriched: boolean;
  aiRetryCount: number;
  lastAiAttempt: string | null;
  processingLock: string | null;
  amount: number | null;
  description: string | null;
  type: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  bank: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

interface NotificationQueueRow {
  id: string;
  package_name: string;
  title: string;
  text: string;
  big_text: string | null;
  sub_text: string | null;
  post_time: number;
  raw_text: string;
  created_at: string;
  status: NotificationQueueStatus;
  ai_enriched: number;
  ai_retry_count: number;
  last_ai_attempt: string | null;
  processing_lock: string | null;
  amount: number | null;
  description: string | null;
  type: TransactionType | null;
  payment_method: PaymentMethod | null;
  bank: string | null;
  category_id: string | null;
  category_name: string | null;
}

function rowToItem(row: NotificationQueueRow): NotificationQueueItem {
  return {
    id: row.id,
    packageName: row.package_name,
    title: row.title,
    text: row.text,
    bigText: row.big_text,
    subText: row.sub_text,
    postTime: row.post_time,
    rawText: row.raw_text,
    createdAt: row.created_at,
    status: row.status,
    aiEnriched: row.ai_enriched === 1,
    aiRetryCount: row.ai_retry_count ?? 0,
    lastAiAttempt: row.last_ai_attempt ?? null,
    processingLock: row.processing_lock ?? null,
    amount: row.amount,
    description: row.description,
    type: row.type,
    paymentMethod: row.payment_method,
    bank: row.bank,
    categoryId: row.category_id,
    categoryName: row.category_name,
  };
}

/**
 * Verifica se uma notificação já existe na fila (dedup persistente).
 */
export async function isNotificationInQueue(
  packageName: string,
  title: string,
  text: string,
  amount: number,
  postTime: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM notification_queue
     WHERE package_name = ? AND title = ? AND text = ? AND amount = ? AND post_time = ?`,
    [packageName, title, text, amount, postTime]
  );
  return (result?.count ?? 0) > 0;
}

/**
 * Adiciona uma notificação à fila com status PENDING_AI.
 * Faz dedup: se já existe com mesmos (package, title, text, amount, postTime), não adiciona.
 * Retorna o ID do item inserido, ou null se era duplicata.
 */
export async function enqueueNotification(
  data: {
    packageName: string;
    title: string;
    text: string;
    bigText: string | null;
    subText: string | null;
    postTime: number;
    rawText: string;
    amount: number;
    description: string;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    bank: string;
    categoryId: string;
    categoryName: string;
  }
): Promise<string | null> {
  const db = await getDb();

  const existing = await isNotificationInQueue(
    data.packageName,
    data.title,
    data.text,
    data.amount,
    data.postTime
  );
  if (existing) return null;

  const id = generateId();
  await db.runAsync(
    `INSERT INTO notification_queue
     (id, package_name, title, text, big_text, sub_text, post_time, raw_text, status, ai_enriched, amount, description, type, payment_method, bank, category_id, category_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_AI', 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.packageName,
      data.title,
      data.text,
      data.bigText,
      data.subText,
      data.postTime,
      data.rawText,
      data.amount,
      data.description,
      data.type,
      data.paymentMethod,
      data.bank,
      data.categoryId,
      data.categoryName,
    ]
  );
  return id;
}

/**
 * Atualiza uma notificação com o resultado da IA e marca status como AI_PROCESSED.
 */
export async function updateWithAiResult(
  id: string,
  data: {
    description: string;
    categoryId: string;
    categoryName: string;
    amount?: number | null;
    type?: TransactionType | null;
    paymentMethod?: PaymentMethod | null;
  }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [
    "description = ?",
    "category_id = ?",
    "category_name = ?",
    "ai_enriched = 1",
    "status = 'AI_PROCESSED'",
  ];
  const params: (string | number | null)[] = [
    data.description,
    data.categoryId,
    data.categoryName,
  ];

  if (data.amount != null) {
    sets.push("amount = ?");
    params.push(data.amount);
  }
  if (data.type != null) {
    sets.push("type = ?");
    params.push(data.type);
  }
  if (data.paymentMethod != null) {
    sets.push("payment_method = ?");
    params.push(data.paymentMethod);
  }

  params.push(id);
  await db.runAsync(
    `UPDATE notification_queue SET ${sets.join(", ")} WHERE id = ?`,
    params
  );
}

/**
 * Marca uma notificação como APPROVED (usuário aprovou a transação).
 */
export async function markApproved(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_queue SET status = 'APPROVED' WHERE id = ?`,
    [id]
  );
}

/**
 * Marca uma notificação como REJECTED (usuário descartou).
 */
export async function markRejected(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_queue SET status = 'REJECTED' WHERE id = ?`,
    [id]
  );
}

/**
 * Retorna todas as notificações aguardando aprovação do usuário
 * (status PENDING_AI ou AI_PROCESSED), ordenadas por mais recentes primeiro.
 */
export async function getPendingApprovalNotifications(): Promise<NotificationQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NotificationQueueRow>(
    `SELECT * FROM notification_queue
     WHERE status IN ('PENDING_AI', 'AI_PROCESSED')
     ORDER BY created_at DESC`
  );
  return rows.map(rowToItem);
}

/**
 * Retorna notificações com status PENDING_AI e ai_enriched = 0 que ainda podem ser retried.
 * Filtra por ai_retry_count < MAX_AI_RETRIES e respeita backoff baseado em last_ai_attempt.
 * Limita o batch para evitar processamento massivo.
 */
export async function getPendingAiNotifications(limit = 10): Promise<NotificationQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NotificationQueueRow>(
    `SELECT * FROM notification_queue
     WHERE status = 'PENDING_AI'
       AND ai_enriched = 0
       AND ai_retry_count < ?
       AND (
         last_ai_attempt IS NULL
         OR datetime(last_ai_attempt) < datetime('now', '-30 seconds')
       )
       AND (
         processing_lock IS NULL
         OR datetime(processing_lock) < datetime('now', '-5 minutes')
       )
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_AI_RETRIES, limit]
  );
  return rows.map(rowToItem);
}

/**
 * Tenta adquirir um lock de processamento para um item.
 * Retorna true se o lock foi adquirido, false se já estava locked.
 */
export async function acquireLock(id: string): Promise<boolean> {
  const db = await getDb();
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.runAsync(
    `UPDATE notification_queue
     SET processing_lock = datetime('now')
     WHERE id = ?
       AND status = 'PENDING_AI'
       AND (
         processing_lock IS NULL
         OR datetime(processing_lock) < datetime('now', '-5 minutes')
       )`,
    [id]
  );
  return result.changes > 0;
}

/**
 * Libera o lock de processamento de um item.
 */
export async function releaseLock(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_queue SET processing_lock = NULL WHERE id = ?`,
    [id]
  );
}

/**
 * Incrementa o contador de retry e atualiza last_ai_attempt.
 */
export async function incrementRetryCount(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_queue
     SET ai_retry_count = ai_retry_count + 1,
         last_ai_attempt = datetime('now'),
         processing_lock = NULL
     WHERE id = ?`,
    [id]
  );
}

/**
 * Limpa locks expirados (stale locks com mais de LOCK_STALE_MINUTES).
 */
export async function cleanupStaleLocks(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    `UPDATE notification_queue
     SET processing_lock = NULL
     WHERE processing_lock IS NOT NULL
       AND datetime(processing_lock) < datetime('now', '-5 minutes')`
  );
}

/**
 * Remove notificações antigas já processadas (APPROVED/REJECTED) com mais de 30 dias.
 * Também remove notificações PENDING_AI com retry_count >= MAX_AI_RETRIES (IA falhou) após 7 dias.
 */
export async function cleanupOldQueueItems(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    `DELETE FROM notification_queue
     WHERE status IN ('APPROVED', 'REJECTED')
     AND created_at < datetime('now', '-30 days');
     DELETE FROM notification_queue
     WHERE status = 'PENDING_AI'
     AND ai_retry_count >= ${MAX_AI_RETRIES}
     AND created_at < datetime('now', '-7 days');`
  );
}

/**
 * Conta notificações pendentes de aprovação.
 */
export async function countPendingApproval(): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM notification_queue
     WHERE status IN ('PENDING_AI', 'AI_PROCESSED')`
  );
  return result?.count ?? 0;
}
