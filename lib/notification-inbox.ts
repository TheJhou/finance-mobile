import { generateId, getDb } from "@/lib/db";
import { emitNotificationQueued } from "@/lib/notification-events";
import { enqueueNotification, findQueuedNotificationId, markReviewed } from "@/lib/notification-queue";
import { BANK_APPS, classifyNotification, inferCategoryFromText } from "@/lib/notifications/parsers";
import { listCategories } from "@/lib/repositories/categories";
import type { TransactionType } from "@/lib/types";
import BankNotifications, { type InboxItem } from "@/modules/bank-notifications";

export type NotificationOutcome = "QUEUED" | "IGNORED" | "UNRECOGNIZED" | "DUPLICATE";

export interface DrainSummary {
  processed: number;
  queued: number;
  failed: number;
}

const INBOX_BATCH_SIZE = 20;
/** Tentativas antes de mandar o item para revisão manual */
const MAX_INBOX_ATTEMPTS = 3;
const LOG_RETENTION_DAYS = 30;

/** Texto completo usado na fila de aprovação e no registro. */
function joinText(item: InboxItem): string {
  return [item.title, item.text, detailText(item)].filter(Boolean).join(" ");
}

/** Texto expandido + linhas dos estilos lista/conversa, no lugar do bigText. */
function detailText(item: InboxItem): string | null {
  const parts = [item.bigText, ...(item.textLines ?? [])].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join("\n") : null;
}

async function writeLog(
  item: InboxItem,
  rawText: string,
  outcome: NotificationOutcome,
  reason: string | null,
  queueId: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO notification_log
       (id, content_hash, package_name, raw_text, post_time, outcome, reason, queue_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), item.contentHash, item.packageName, rawText, item.postTime, outcome, reason, queueId]
  );
}

const OUTCOME_PRIORITY: NotificationOutcome[] = ["QUEUED", "UNRECOGNIZED", "IGNORED", "DUPLICATE"];

/**
 * Grava uma notificação da fila de entrada no banco do app. Idempotente:
 * reprocessar o mesmo item (app encerrado antes do ack) não duplica nada.
 * Notificação agrupada (várias linhas, estilo lista) vira um lançamento por linha.
 */
export async function processInboxItem(item: InboxItem): Promise<NotificationOutcome> {
  const lines = (item.textLines ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) return processUnit(item, null);

  const outcomes: NotificationOutcome[] = [];
  const occurrences = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    const unit: InboxItem = {
      ...item,
      contentHash: `${item.contentHash}#${index}`,
      text: line,
      bigText: null,
      textLines: [],
      // Linhas iguais no mesmo grupo são lançamentos distintos (dois cafés):
      // o postTime diferente impede a fila de aprovação de juntá-las
      postTime: item.postTime + index,
    };
    outcomes.push(await processUnit(unit, { groupHash: item.contentHash, line, occurrence }));
  }
  return OUTCOME_PRIORITY.find((outcome) => outcomes.includes(outcome)) ?? "DUPLICATE";
}

interface GroupedLine {
  /** contentHash da notificação agrupada de onde a linha veio */
  groupHash: string;
  line: string;
  /** Quantas vezes esta mesma linha já apareceu no grupo, contando esta */
  occurrence: number;
}

/**
 * Quantas vezes a linha já foi registrada no último dia, fora deste grupo:
 * sozinha (a compra chega como notificação própria e depois reaparece na lista)
 * ou em versões anteriores da lista (o banco reenvia tudo a cada lançamento).
 */
async function countLineElsewhere(packageName: string, grouped: GroupedLine): Promise<number> {
  const db = await getDb();
  const prefix = `${grouped.groupHash}#`;
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM notification_log
     WHERE package_name = ?
       AND outcome != 'DUPLICATE'
       AND created_at >= datetime('now', '-1 day')
       AND instr(raw_text, ?) > 0
       AND substr(content_hash, 1, ?) != ?`,
    [packageName, grouped.line, prefix.length, prefix]
  );
  return row?.count ?? 0;
}

async function processUnit(item: InboxItem, grouped: GroupedLine | null): Promise<NotificationOutcome> {
  const db = await getDb();
  const logged = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM notification_log WHERE content_hash = ?`,
    [item.contentHash]
  );
  if (logged) return "DUPLICATE";

  const rawText = joinText(item);
  // Só as ocorrências além das já vistas são novas: [café] e depois [café, café] = 2 cafés
  if (grouped && grouped.occurrence <= (await countLineElsewhere(item.packageName, grouped))) {
    await writeLog(item, rawText, "DUPLICATE", "linha repetida de notificação agrupada", null);
    return "DUPLICATE";
  }
  const classification = classifyNotification({
    packageName: item.packageName,
    title: item.title,
    text: item.text,
    bigText: detailText(item),
    subText: item.subText,
    postTime: item.postTime,
  });

  if (classification.status !== "parsed") {
    const outcome = classification.status === "ignored" ? "IGNORED" : "UNRECOGNIZED";
    await writeLog(item, rawText, outcome, classification.reason, null);
    return outcome;
  }

  const parsed = classification.transaction;
  if (!(parsed.amount > 0)) {
    await writeLog(item, rawText, "UNRECOGNIZED", "valor inválido", null);
    return "UNRECOGNIZED";
  }

  // Categoria provisória por palavras-chave; a IA refina depois, fora deste caminho
  const categories = await listCategories();
  const inferredName = inferCategoryFromText(rawText);
  const category =
    (inferredName && categories.find((c) => c.name.toLowerCase() === inferredName.toLowerCase())) ||
    categories[0] ||
    null;

  const queueId = await enqueueNotification({
    packageName: item.packageName,
    title: item.title,
    text: rawText,
    bigText: detailText(item),
    subText: item.subText,
    postTime: item.postTime,
    rawText,
    amount: parsed.amount,
    description: parsed.description || "Transação",
    type: parsed.type,
    paymentMethod: parsed.paymentMethod,
    bank: parsed.bank,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
  });

  if (!queueId) {
    // Já está na fila. Se nenhum registro aponta para o item, o app foi
    // encerrado entre gravar a fila e o registro: completa como QUEUED.
    const existingId = await findQueuedNotificationId({
      packageName: item.packageName,
      title: item.title,
      text: rawText,
      amount: parsed.amount,
      postTime: item.postTime,
    });
    const orphan =
      existingId &&
      !(await db.getFirstAsync<{ id: string }>(`SELECT id FROM notification_log WHERE queue_id = ?`, [existingId]));
    if (orphan) {
      await writeLog(item, rawText, "QUEUED", "recuperada após interrupção", existingId);
      return "QUEUED";
    }
    await writeLog(item, rawText, "DUPLICATE", "já estava na fila de aprovação", null);
    return "DUPLICATE";
  }
  await writeLog(item, rawText, "QUEUED", null, queueId);
  return "QUEUED";
}

let draining: Promise<DrainSummary> | null = null;
let drainAgain = false;

/**
 * Esvazia a fila de entrada nativa: grava cada item e só então confirma (ack)
 * ao lado nativo. Um item que falhar fica na fila e é tentado na próxima vez.
 * Só usa promessas (sem timers nem rede): funciona com o app em segundo plano.
 * Chamadas simultâneas não processam o mesmo item duas vezes.
 */
export function drainInbox(): Promise<DrainSummary> {
  if (draining) {
    drainAgain = true;
    return draining;
  }
  draining = (async () => {
    const total: DrainSummary = { processed: 0, queued: 0, failed: 0 };
    try {
      do {
        drainAgain = false;
        const summary = await drainOnce();
        total.processed += summary.processed;
        total.queued += summary.queued;
        total.failed += summary.failed;
      } while (drainAgain);
    } finally {
      draining = null;
    }
    // Avisa a tela de importação: pode haver item para aprovar ou para revisar
    if (total.processed > 0) emitNotificationQueued();
    return total;
  })();
  return draining;
}

async function drainOnce(): Promise<DrainSummary> {
  const summary: DrainSummary = { processed: 0, queued: 0, failed: 0 };
  if (!BankNotifications) return summary;

  for (;;) {
    const items = await BankNotifications.getInbox(INBOX_BATCH_SIZE);
    if (items.length === 0) break;

    const done: number[] = [];
    const failed: number[] = [];
    for (const item of items) {
      try {
        const outcome = await processInboxItem(item);
        done.push(item.id);
        summary.processed++;
        if (outcome === "QUEUED") summary.queued++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[NotificationInbox] Falha ao gravar item ${item.id} (${item.packageName}):`, message);
        if ((item.attempts ?? 0) + 1 >= MAX_INBOX_ATTEMPTS && (await giveUp(item, message))) {
          done.push(item.id);
          summary.processed++;
        } else {
          failed.push(item.id);
          summary.failed++;
        }
      }
    }
    if (done.length > 0) await BankNotifications.ackInbox(done);
    if (failed.length > 0) {
      // Vão para o fim da fila nativa: não impedem os outros itens na próxima vez
      await BankNotifications.failInbox(failed);
      // Para aqui para não repetir o mesmo item em laço; tenta de novo no próximo gatilho
      break;
    }
  }
  return summary;
}

/**
 * Item que falha sempre: desiste de interpretar e o registra para revisão
 * manual, com o texto original. Se nem o registro der certo (ex.: banco
 * indisponível), mantém na fila nativa: melhor esperar do que perder.
 */
async function giveUp(item: InboxItem, message: string): Promise<boolean> {
  try {
    await writeLog(item, joinText(item), "UNRECOGNIZED", `erro ao processar: ${message}`.slice(0, 300), null);
    return true;
  } catch (error) {
    console.warn(`[NotificationInbox] Falha ao registrar o item ${item.id} para revisão:`, error);
    return false;
  }
}

export interface NotificationLogStats {
  QUEUED: number;
  IGNORED: number;
  UNRECOGNIZED: number;
  DUPLICATE: number;
}

/** Contagem por resultado nos últimos `days` dias (tela de diagnóstico). */
export async function getNotificationLogStats(days = 7): Promise<NotificationLogStats> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ outcome: NotificationOutcome; count: number }>(
    `SELECT outcome, COUNT(*) as count FROM notification_log
     WHERE created_at >= datetime('now', ?)
     GROUP BY outcome`,
    [`-${days} days`]
  );
  const stats: NotificationLogStats = { QUEUED: 0, IGNORED: 0, UNRECOGNIZED: 0, DUPLICATE: 0 };
  for (const row of rows) stats[row.outcome] = row.count;
  return stats;
}

export interface NotificationLogEntry {
  id: string;
  packageName: string;
  rawText: string;
  postTime: number;
  outcome: NotificationOutcome;
  reason: string | null;
  createdAt: string;
}

/** Notificações com valor em R$ que nenhuma regra aceitou (possíveis transações perdidas). */
export async function listUnrecognizedNotifications(limit = 50): Promise<NotificationLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    package_name: string;
    raw_text: string;
    post_time: number;
    outcome: NotificationOutcome;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT * FROM notification_log WHERE outcome = 'UNRECOGNIZED' ORDER BY post_time DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    packageName: r.package_name,
    rawText: r.raw_text,
    postTime: r.post_time,
    outcome: r.outcome,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

/**
 * Transforma uma notificação não reconhecida, revisada pelo usuário, num item
 * da fila de aprovação. Retorna o id na fila (ou null se ela já foi tratada).
 */
export async function promoteUnrecognized(
  logId: string,
  data: { amount: number; type: TransactionType; description: string }
): Promise<string | null> {
  const db = await getDb();
  const entry = await db.getFirstAsync<{ package_name: string; raw_text: string; post_time: number }>(
    `SELECT package_name, raw_text, post_time FROM notification_log WHERE id = ? AND outcome = 'UNRECOGNIZED'`,
    [logId]
  );
  if (!entry) return null;

  const bank = BANK_APPS[entry.package_name] ?? entry.package_name;
  const categories = await listCategories();
  const inferredName = inferCategoryFromText(`${data.description} ${entry.raw_text}`);
  const category =
    (inferredName && categories.find((c) => c.name.toLowerCase() === inferredName.toLowerCase())) ||
    categories[0] ||
    null;

  const queueId = await enqueueNotification({
    packageName: entry.package_name,
    title: bank,
    text: entry.raw_text,
    bigText: null,
    subText: null,
    postTime: entry.post_time,
    rawText: entry.raw_text,
    amount: data.amount,
    description: data.description.trim() || "Transação",
    type: data.type,
    paymentMethod: "OTHER",
    bank,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
  });

  // Valor, tipo e descrição vieram do usuário: a IA não pode sobrescrever
  if (queueId) await markReviewed(queueId);
  await db.runAsync(
    `UPDATE notification_log SET outcome = 'QUEUED', reason = 'revisada pelo usuário', queue_id = ? WHERE id = ?`,
    [queueId, logId]
  );
  if (queueId) emitNotificationQueued();
  return queueId;
}

/** O usuário confirmou que a notificação não é uma transação. */
export async function dismissUnrecognized(logId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notification_log SET outcome = 'IGNORED', reason = 'descartada pelo usuário'
     WHERE id = ? AND outcome = 'UNRECOGNIZED'`,
    [logId]
  );
}

/**
 * Esconde números que identificam a pessoa (CPF/CNPJ, cartão, conta, telefone,
 * e-mail) mantendo o formato do texto e os valores em R$. Nomes não são
 * removidos: o usuário revisa antes de compartilhar.
 */
export function anonymizeNotificationText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "email@exemplo.com")
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "000.000.000-00")
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "00.000.000/0000-00")
    .replace(/(R\$\s*)?(\d[\d.\-/ ]{2,}\d)/g, (match, currency: string | undefined, digits: string) =>
      currency || /,\d{1,2}$/.test(digits) || digits.replace(/\D/g, "").length < 4 ? match : digits.replace(/\d/g, "0")
    );
}

/** Exemplos de notificações não reconhecidas, prontos para enviar ao suporte. */
export async function buildUnrecognizedSamples(limit = 30): Promise<string> {
  const entries = await listUnrecognizedNotifications(limit);
  return entries
    .map((e) => `[${BANK_APPS[e.packageName] ?? e.packageName}] ${anonymizeNotificationText(e.rawText.replace(/\s*\n\s*/g, " | "))}`)
    .join("\n");
}

export async function cleanupNotificationLog(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM notification_log WHERE created_at < datetime('now', ?)`, [
    `-${LOG_RETENTION_DAYS} days`,
  ]);
}
