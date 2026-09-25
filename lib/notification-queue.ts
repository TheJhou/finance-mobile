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

/** Id do item da fila com a mesma chave de deduplicação, se existir. */
export async function findQueuedNotificationId(key: {
  packageName: string;
  title: string;
  text: string;
  amount: number;
  postTime: number;
}): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM notification_queue
     WHERE package_name = ? AND title = ? AND text = ? AND amount = ? AND post_time = ?`,
    [key.packageName, key.title, key.text, key.amount, key.postTime]
  );
  return row?.id ?? null;
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
    /** Nulo quando não há categorias: o usuário escolhe ao aprovar */
    categoryId: string | null;
    categoryName: string | null;
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
 * Aplica o enriquecimento da IA e marca o item como AI_PROCESSED.
 * Valor e tipo não passam por aqui: vêm do parser ou do usuário.
 * Só altera itens ainda em PENDING_AI: a IA pode responder depois de o usuário
 * aprovar ou descartar, e não pode devolver o item para a lista (isso gerava
 * transação duplicada). Retorna se o item foi atualizado.
 */
export async function updateWithAiResult(
  id: string,
  data: {
    description: string;
    categoryId: string;
    categoryName: string;
    paymentMethod?: PaymentMethod | null;
  }
): Promise<boolean> {
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

  if (data.paymentMethod != null) {
    sets.push("payment_method = ?");
    params.push(data.paymentMethod);
  }

  params.push(id);
  const result = await db.runAsync(
    `UPDATE notification_queue SET ${sets.join(", ")} WHERE id = ? AND status = 'PENDING_AI'`,
    params
  );
  return result.changes > 0;
}

/** Marca como já revisado (pelo usuário): a IA não mexe mais no item. */
export async function markReviewed(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_queue SET ai_enriched = 1, status = 'AI_PROCESSED' WHERE id = ? AND status = 'PENDING_AI'`,
    [id]
  );
}

/**
 * Aprova uma notificação e cria a transação. A notificação é reservada antes
 * (UPDATE condicional), então toque duplo ou duas telas abertas não geram duas
 * transações: a segunda chamada devolve null. Se criar a transação falhar, a
 * reserva é desfeita e a notificação volta para a lista.
 * Não usa withTransactionAsync: no expo-sqlite ela não é exclusiva, e um
 * rollback desfaria também gravações da fila de entrada feitas em paralelo.
 */
export async function approveNotification<T>(id: string, createTransaction: () => Promise<T>): Promise<T | null> {
  const db = await getDb();
  const current = await db.getFirstAsync<{ status: NotificationQueueStatus }>(
    `SELECT status FROM notification_queue WHERE id = ?`,
    [id]
  );
  if (!current || (current.status !== "PENDING_AI" && current.status !== "AI_PROCESSED")) return null;

  const claim = await db.runAsync(
    `UPDATE notification_queue SET status = 'APPROVED' WHERE id = ? AND status = ?`,
    [id, current.status]
  );
  if (claim.changes === 0) return null;

  try {
    return await createTransaction();
  } catch (error) {
    await db.runAsync(`UPDATE notification_queue SET status = ? WHERE id = ?`, [current.status, id]);
    throw error;
  }
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
 * Remove notificações já tratadas (APPROVED/REJECTED) com mais de 30 dias.
 * Pendentes nunca são apagadas: sem IA (offline, limite de uso) elas ficam na
 * lista com os dados do parser até o usuário aprovar ou descartar.
 */
export async function cleanupOldQueueItems(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    `DELETE FROM notification_queue
     WHERE status IN ('APPROVED', 'REJECTED')
     AND created_at < datetime('now', '-30 days');`
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
