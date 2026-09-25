import { pushInboxItem } from "@/__mocks__/bank-notifications";
import { analyzeText } from "@/lib/backend";
import { getDb } from "@/lib/db";
import { enrichPendingNotifications } from "@/lib/notification-ai";
import { drainInbox, listUnrecognizedNotifications, promoteUnrecognized } from "@/lib/notification-inbox";
import {
  approveNotification,
  cleanupOldQueueItems,
  getPendingApprovalNotifications,
  markRejected,
} from "@/lib/notification-queue";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";

jest.mock("@/lib/backend", () => ({ analyzeText: jest.fn() }));
const mockAnalyze = analyzeText as jest.MockedFunction<typeof analyzeText>;

function aiReturns(draft: Record<string, unknown>) {
  mockAnalyze.mockResolvedValue({ draft });
}

async function queueNubankPurchase(text = "Compra aprovada de R$ 25,90 em PADARIA PAO QUENTE.") {
  pushInboxItem({ packageName: "com.nu.production", title: "Compra aprovada", text });
  await drainInbox();
  const [item] = await getPendingApprovalNotifications();
  return item;
}

async function countTransactions(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM transactions"))?.c ?? 0;
}

beforeEach(() => {
  mockAnalyze.mockReset();
});

describe("enrichPendingNotifications — corrida com a aprovação", () => {
  it("a IA respondendo depois da aprovação não reabre a notificação nem duplica a transação", async () => {
    const item = await queueNubankPurchase();
    const [category] = await listCategories();
    const tx = { description: "Padaria", amount: 25.9, type: "EXPENSE" as const, date: "2026-09-25", categoryId: category.id };

    // O usuário aprova enquanto a IA ainda está respondendo
    mockAnalyze.mockImplementation(async () => {
      await approveNotification(item.id, () => createTransaction(tx));
      return { draft: { description: "Padaria", amount: 25.9, type: "EXPENSE", categoryName: category.name } };
    });

    await enrichPendingNotifications();

    expect(await getPendingApprovalNotifications()).toHaveLength(0);
    expect(await approveNotification(item.id, () => createTransaction(tx))).toBeNull();
    expect(await countTransactions()).toBe(1);
  });

  it("a IA respondendo depois do descarte não traz a notificação de volta", async () => {
    const item = await queueNubankPurchase();
    mockAnalyze.mockImplementation(async () => {
      await markRejected(item.id);
      return { draft: { description: "Padaria", amount: 25.9, type: "EXPENSE" } };
    });

    await enrichPendingNotifications();

    expect(await getPendingApprovalNotifications()).toHaveLength(0);
  });
});

describe("enrichPendingNotifications — a IA completa, não corrige", () => {
  it("não altera valor nem tipo lidos pelo parser", async () => {
    await queueNubankPurchase();
    aiReturns({ description: "Padaria", amount: 1200, type: "INCOME" });

    await enrichPendingNotifications();

    const [item] = await getPendingApprovalNotifications();
    expect(item.amount).toBe(25.9);
    expect(item.type).toBe("EXPENSE");
    expect(item.status).toBe("AI_PROCESSED");
  });

  it("mantém a descrição específica do parser", async () => {
    await queueNubankPurchase();
    aiReturns({ description: "Outra coisa", amount: 25.9, type: "EXPENSE" });

    await enrichPendingNotifications();

    expect((await getPendingApprovalNotifications())[0].description).toBe("PADARIA PAO QUENTE");
  });

  it("troca a descrição genérica do parser", async () => {
    await queueNubankPurchase("Compra aprovada de R$ 45,00");
    aiReturns({ description: "Compra no cartão", amount: 45, type: "EXPENSE" });

    await enrichPendingNotifications();

    expect((await getPendingApprovalNotifications())[0].description).toBe("Compra no cartão");
  });

  it("não mexe no que o usuário revisou", async () => {
    pushInboxItem({ packageName: "com.itau", title: "Itaú", text: "Movimentação de R$ 50,00 na conta" });
    await drainInbox();
    const [entry] = await listUnrecognizedNotifications();
    await promoteUnrecognized(entry.id, { amount: 50, type: "INCOME", description: "Reembolso do João" });
    aiReturns({ description: "Outra", amount: 999, type: "EXPENSE" });

    await enrichPendingNotifications();

    expect(mockAnalyze).not.toHaveBeenCalled();
    const [item] = await getPendingApprovalNotifications();
    expect(item).toMatchObject({ amount: 50, type: "INCOME", description: "Reembolso do João" });
  });
});

describe("cleanupOldQueueItems", () => {
  it("não apaga pendente antiga em que a IA desistiu", async () => {
    const item = await queueNubankPurchase();
    const db = await getDb();
    await db.runAsync(
      `UPDATE notification_queue SET ai_retry_count = 3, created_at = datetime('now', '-8 days') WHERE id = ?`,
      [item.id]
    );

    await cleanupOldQueueItems();

    expect((await getPendingApprovalNotifications()).map((p) => p.id)).toEqual([item.id]);
  });

  it("apaga as já tratadas com mais de 30 dias", async () => {
    const item = await queueNubankPurchase();
    const db = await getDb();
    await markRejected(item.id);
    await db.runAsync(`UPDATE notification_queue SET created_at = datetime('now', '-31 days') WHERE id = ?`, [item.id]);

    await cleanupOldQueueItems();

    const row = await db.getFirstAsync("SELECT id FROM notification_queue WHERE id = ?", [item.id]);
    expect(row).toBeNull();
  });
});
