import { getMockInbox, mockBankNotifications, pushInboxItem, setFailGetInbox } from "@/__mocks__/bank-notifications";
import { getDb, wipeUserData } from "@/lib/db";
import {
  anonymizeNotificationText,
  buildUnrecognizedSamples,
  dismissUnrecognized,
  drainInbox,
  getNotificationLogStats,
  listUnrecognizedNotifications,
  processInboxItem,
  promoteUnrecognized,
} from "@/lib/notification-inbox";
import { guessTransaction } from "@/lib/notifications/parsers";
import * as queue from "@/lib/notification-queue";
import { approveNotification, getPendingApprovalNotifications } from "@/lib/notification-queue";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";

const NUBANK_PURCHASE = {
  packageName: "com.nu.production",
  title: "Compra aprovada",
  text: "Compra aprovada de R$ 25,90 em PADARIA PAO QUENTE.",
};

async function logOutcomes(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ outcome: string }>(`SELECT outcome FROM notification_log ORDER BY post_time`);
  return rows.map((r) => r.outcome);
}

describe("migração v5", () => {
  it("cria notification_log e marca a versão 5", async () => {
    const db = await getDb();
    const table = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_log'`
    );
    const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(table?.name).toBe("notification_log");
    expect(version?.user_version).toBe(5);
  });
});

describe("drainInbox", () => {
  it("grava a transação reconhecida na fila de aprovação e confirma ao nativo", async () => {
    pushInboxItem(NUBANK_PURCHASE);

    const summary = await drainInbox();

    expect(summary).toEqual({ processed: 1, queued: 1, failed: 0 });
    expect(getMockInbox()).toHaveLength(0);
    const pending = await getPendingApprovalNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe(25.9);
    expect(pending[0].type).toBe("EXPENSE");
    expect(await logOutcomes()).toEqual(["QUEUED"]);
  });

  it("não duplica a mesma notificação reapresentada pelo nativo", async () => {
    pushInboxItem({ ...NUBANK_PURCHASE, contentHash: "mesmo-hash" });
    await drainInbox();
    // Ex.: app encerrado depois de gravar e antes do ack; o item volta na fila
    pushInboxItem({ ...NUBANK_PURCHASE, contentHash: "mesmo-hash" });
    await drainInbox();

    expect(await getPendingApprovalNotifications()).toHaveLength(1);
    expect(getMockInbox()).toHaveLength(0);
  });

  it("mantém duas compras iguais em momentos diferentes", async () => {
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 1_000 });
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 2_000 });

    await drainInbox();

    expect(await getPendingApprovalNotifications()).toHaveLength(2);
  });

  it("grava a compra que cita o saldo no fim (antes era descartada)", async () => {
    pushInboxItem({
      packageName: "com.itau",
      title: "Itaú",
      text: "Compra de R$ 50,00 no débito em POSTO SHELL. Seu saldo disponível é R$ 1.200,00",
    });

    await drainInbox();

    const pending = await getPendingApprovalNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe(50);
    expect(pending[0].description).toBe("POSTO SHELL");
  });

  it("registra como não reconhecida a notificação com valor e sem verbo de transação", async () => {
    pushInboxItem({ packageName: "com.itau", title: "Itaú", text: "Movimentação de R$ 50,00 na conta" });

    await drainInbox();

    expect(await getPendingApprovalNotifications()).toHaveLength(0);
    expect(getMockInbox()).toHaveLength(0);
    const unrecognized = await listUnrecognizedNotifications();
    expect(unrecognized).toHaveLength(1);
    expect(unrecognized[0].rawText).toContain("Movimentação");
    expect(unrecognized[0].reason).toBe("valor sem verbo de transação");
  });

  it("cria um lançamento por linha de notificação agrupada", async () => {
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "2 novas notificações",
      textLines: ["Compra aprovada de R$ 10,00 em CAFE", "Compra aprovada de R$ 20,00 em LOJA"],
    });

    const summary = await drainInbox();

    expect(summary.queued).toBe(1);
    const amounts = (await getPendingApprovalNotifications()).map((p) => p.amount).sort();
    expect(amounts).toEqual([10, 20]);
  });

  it("não duplica a compra que chegou sozinha e depois reaparece na lista", async () => {
    pushInboxItem({ packageName: "com.nu.production", title: "Nubank", text: "Compra aprovada de R$ 10,00 em CAFE" });
    await drainInbox();
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "2 novas notificações",
      textLines: ["Compra aprovada de R$ 10,00 em CAFE", "Compra aprovada de R$ 20,00 em LOJA"],
    });

    await drainInbox();

    const amounts = (await getPendingApprovalNotifications()).map((p) => p.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(amounts).toEqual([10, 20]);
  });

  it("conta linhas iguais: [café] e depois [café, café] são dois cafés", async () => {
    const coffee = "Compra aprovada de R$ 5,00 em CAFE";
    pushInboxItem({ packageName: "com.nu.production", title: "Nubank", text: "1", textLines: [coffee, "Compra aprovada de R$ 7,00 em PAO"] });
    await drainInbox();
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "2",
      textLines: [coffee, coffee, "Compra aprovada de R$ 7,00 em PAO"],
    });
    await drainInbox();
    // Reenvio idêntico da lista: nada novo
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "3",
      textLines: [coffee, coffee, "Compra aprovada de R$ 7,00 em PAO"],
    });
    await drainInbox();

    const amounts = (await getPendingApprovalNotifications()).map((p) => p.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(amounts).toEqual([5, 5, 7]);
  });

  it("linha não reconhecida reenviada aparece uma vez só na revisão", async () => {
    for (let i = 0; i < 3; i++) {
      pushInboxItem({
        packageName: "com.itau",
        title: "Itaú",
        text: `${i + 2} notificações`,
        textLines: ["Movimentação de R$ 50,00 na conta", ...Array.from({ length: i + 1 }, (_, k) => `Pix enviado de R$ ${k + 1},00 para ANA`)],
      });
      await drainInbox();
    }

    expect(await listUnrecognizedNotifications()).toHaveLength(1);
    expect(await getPendingApprovalNotifications()).toHaveLength(3);
  });

  it("não repete as linhas quando o banco reenvia a lista com um lançamento novo", async () => {
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "2 novas notificações",
      textLines: ["Compra aprovada de R$ 10,00 em CAFE", "Compra aprovada de R$ 20,00 em LOJA"],
    });
    await drainInbox();
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "3 novas notificações",
      textLines: [
        "Compra aprovada de R$ 10,00 em CAFE",
        "Compra aprovada de R$ 20,00 em LOJA",
        "Compra aprovada de R$ 30,00 em POSTO",
      ],
    });

    await drainInbox();

    const amounts = (await getPendingApprovalNotifications()).map((p) => p.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(amounts).toEqual([10, 20, 30]);
  });

  it("registra como ignorada a notificação que nunca é transação", async () => {
    pushInboxItem({ packageName: "com.nu.production", title: "Nubank", text: "Login realizado em novo dispositivo" });

    await drainInbox();

    expect(await logOutcomes()).toEqual(["IGNORED"]);
    expect(await getPendingApprovalNotifications()).toHaveLength(0);
  });

  it("lê o valor das linhas de notificação em lista (InboxStyle)", async () => {
    pushInboxItem({
      packageName: "com.nu.production",
      title: "Nubank",
      text: "2 novas notificações",
      textLines: ["Compra aprovada de R$ 10,00 em MERCADO BOM"],
    });

    await drainInbox();

    const pending = await getPendingApprovalNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe(10);
  });

  it("grava mesmo sem categorias cadastradas", async () => {
    const db = await getDb();
    await db.execAsync("DELETE FROM categories");
    pushInboxItem(NUBANK_PURCHASE);

    await drainInbox();

    const pending = await getPendingApprovalNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].categoryId).toBeNull();
  });

  it("mantém na fila o item que falhou e confirma os demais", async () => {
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 1_000 });
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 2_000 });
    const spy = jest.spyOn(queue, "enqueueNotification").mockRejectedValueOnce(new Error("disco cheio"));

    const first = await drainInbox();

    expect(first.failed).toBe(1);
    expect(getMockInbox()).toHaveLength(1);
    spy.mockRestore();

    const second = await drainInbox();
    expect(second.failed).toBe(0);
    expect(getMockInbox()).toHaveLength(0);
    expect(await getPendingApprovalNotifications()).toHaveLength(2);
  });

  it("item que sempre falha não bloqueia a fila e vai para revisão na 3ª tentativa", async () => {
    const original = queue.enqueueNotification;
    const spy = jest.spyOn(queue, "enqueueNotification").mockImplementation(async (data) => {
      if (data.amount === 13) throw new Error("dado corrompido");
      return original(data);
    });
    pushInboxItem({ ...NUBANK_PURCHASE, text: "Compra aprovada de R$ 13,00 em LOJA RUIM", postTime: 1_000 });
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 2_000 });

    await drainInbox();
    // Chega outra depois da falha: é processada antes do item problemático
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 3_000 });
    await drainInbox();
    await drainInbox();

    spy.mockRestore();
    expect(getMockInbox()).toHaveLength(0);
    expect(await getPendingApprovalNotifications()).toHaveLength(2);
    const [review] = await listUnrecognizedNotifications();
    expect(review.rawText).toContain("LOJA RUIM");
    expect(review.reason).toBe("erro ao processar: dado corrompido");
  });

  it("completa o registro de item gravado na fila antes de uma interrupção", async () => {
    const item = pushInboxItem(NUBANK_PURCHASE);
    expect(await processInboxItem(item)).toBe("QUEUED");
    // Simula o app encerrado depois de gravar a fila e antes do registro
    const db = await getDb();
    await db.runAsync("DELETE FROM notification_log");

    expect(await processInboxItem(item)).toBe("QUEUED");

    expect(await getPendingApprovalNotifications()).toHaveLength(1);
    expect(await getNotificationLogStats()).toMatchObject({ QUEUED: 1, DUPLICATE: 0 });
  });

  it("chamadas simultâneas não processam o mesmo item duas vezes", async () => {
    for (let i = 0; i < 5; i++) pushInboxItem({ ...NUBANK_PURCHASE, postTime: 1_000 + i });

    await Promise.all([drainInbox(), drainInbox(), drainInbox()]);

    expect(await getPendingApprovalNotifications()).toHaveLength(5);
    expect(getMockInbox()).toHaveLength(0);
    const db = await getDb();
    const logCount = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM notification_log");
    expect(logCount?.c).toBe(5);
  });

  it("processa itens capturados durante uma drenagem em andamento", async () => {
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 1_000 });
    const running = drainInbox();
    pushInboxItem({ ...NUBANK_PURCHASE, postTime: 2_000 });
    await drainInbox();
    await running;

    expect(getMockInbox()).toHaveLength(0);
    expect(await getPendingApprovalNotifications()).toHaveLength(2);
  });

  it("volta a funcionar depois de uma falha ao ler a fila nativa", async () => {
    pushInboxItem(NUBANK_PURCHASE);
    setFailGetInbox(true);
    await expect(drainInbox()).rejects.toThrow("getInbox indisponível");

    setFailGetInbox(false);
    const summary = await drainInbox();
    expect(summary.queued).toBe(1);
  });

  it("processa em lotes até esvaziar a fila", async () => {
    for (let i = 0; i < 45; i++) pushInboxItem({ ...NUBANK_PURCHASE, postTime: 10_000 + i });

    const summary = await drainInbox();

    expect(summary.processed).toBe(45);
    expect(mockBankNotifications.ackInbox).toHaveBeenCalledTimes(3);
    expect(getMockInbox()).toHaveLength(0);
  });
});

describe("processInboxItem", () => {
  it("é idempotente pelo contentHash", async () => {
    const item = pushInboxItem(NUBANK_PURCHASE);
    expect(await processInboxItem(item)).toBe("QUEUED");
    expect(await processInboxItem(item)).toBe("DUPLICATE");
  });
});

describe("getNotificationLogStats", () => {
  it("conta os resultados por tipo", async () => {
    pushInboxItem(NUBANK_PURCHASE);
    pushInboxItem({ packageName: "com.nu.production", title: "Nubank", text: "Login realizado" });
    pushInboxItem({ packageName: "com.itau", title: "Itaú", text: "Pix de R$ 10,00. Saldo atual R$ 90,00" });

    await drainInbox();

    expect(await getNotificationLogStats()).toEqual({ QUEUED: 1, IGNORED: 1, UNRECOGNIZED: 1, DUPLICATE: 0 });
  });

  it("é apagado junto com os dados do usuário", async () => {
    pushInboxItem(NUBANK_PURCHASE);
    await drainInbox();

    await wipeUserData();

    expect(await getNotificationLogStats()).toEqual({ QUEUED: 0, IGNORED: 0, UNRECOGNIZED: 0, DUPLICATE: 0 });
  });
});

describe("revisão das não reconhecidas", () => {
  async function unrecognizedEntry() {
    pushInboxItem({ packageName: "com.itau", title: "Itaú", text: "Movimentação de R$ 50,00 na conta" });
    await drainInbox();
    const [entry] = await listUnrecognizedNotifications();
    return entry;
  }

  it("promove para a fila de aprovação com os dados revisados", async () => {
    const entry = await unrecognizedEntry();

    const queueId = await promoteUnrecognized(entry.id, { amount: 50, type: "INCOME", description: "Reembolso" });

    expect(queueId).not.toBeNull();
    const [pending] = await getPendingApprovalNotifications();
    expect(pending).toMatchObject({ amount: 50, type: "INCOME", description: "Reembolso", bank: "Itaú" });
    expect(await listUnrecognizedNotifications()).toHaveLength(0);
    expect((await getNotificationLogStats()).QUEUED).toBe(1);
  });

  it("não promove duas vezes", async () => {
    const entry = await unrecognizedEntry();
    await promoteUnrecognized(entry.id, { amount: 50, type: "EXPENSE", description: "X" });

    expect(await promoteUnrecognized(entry.id, { amount: 50, type: "EXPENSE", description: "X" })).toBeNull();
    expect(await getPendingApprovalNotifications()).toHaveLength(1);
  });

  it("descarta sem criar nada", async () => {
    const entry = await unrecognizedEntry();

    await dismissUnrecognized(entry.id);

    expect(await listUnrecognizedNotifications()).toHaveLength(0);
    expect(await getPendingApprovalNotifications()).toHaveLength(0);
    expect((await getNotificationLogStats()).IGNORED).toBe(1);
  });

  it("sugere valor, tipo e descrição a partir do texto", () => {
    expect(guessTransaction("Movimentação de R$ 50,00 na conta")).toEqual({ amount: 50, type: "EXPENSE", description: "" });
    expect(guessTransaction("Pix de R$ 20,00 recebido de ANA")).toEqual({ amount: 20, type: "INCOME", description: "ANA" });
    expect(guessTransaction("Sem valor")).toEqual({ amount: null, type: "EXPENSE", description: "" });
  });
});

describe("anonymizeNotificationText", () => {
  it("esconde documentos, cartão, telefone e e-mail e mantém os valores", () => {
    const text =
      "Pix de R$ 1.234,56 para CPF 123.456.789-00, cartão final 4321, tel 99999-8888, email ana@x.com, CNPJ 12.345.678/0001-90. Saldo 50,00";
    expect(anonymizeNotificationText(text)).toBe(
      "Pix de R$ 1.234,56 para CPF 000.000.000-00, cartão final 0000, tel 00000-0000, email email@exemplo.com, CNPJ 00.000.000/0000-00. Saldo 50,00"
    );
  });

  it("monta os exemplos com o nome do banco, uma linha por notificação", async () => {
    pushInboxItem({ packageName: "com.itau", title: "Itaú", text: "Movimentação de R$ 50,00 na conta 12345" });
    await drainInbox();

    expect(await buildUnrecognizedSamples()).toBe("[Itaú] Itaú Movimentação de R$ 50,00 na conta 00000");
  });
});

describe("approveNotification", () => {
  async function queuedItemAndTxData() {
    pushInboxItem(NUBANK_PURCHASE);
    await drainInbox();
    const [item] = await getPendingApprovalNotifications();
    const [category] = await listCategories();
    const txData = {
      description: item.description ?? "Transação",
      amount: item.amount ?? 0,
      type: "EXPENSE" as const,
      date: "2026-09-25",
      categoryId: category.id,
      source: "BANK_NOTIFICATION" as const,
    };
    return { item, txData };
  }

  async function countTransactions(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM transactions");
    return row?.c ?? 0;
  }

  it("cria uma única transação mesmo com toque duplo", async () => {
    const { item, txData } = await queuedItemAndTxData();

    const [first, second] = await Promise.all([
      approveNotification(item.id, () => createTransaction(txData)),
      approveNotification(item.id, () => createTransaction(txData)),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await countTransactions()).toBe(1);
    expect(await getPendingApprovalNotifications()).toHaveLength(0);
  });

  it("devolve a notificação para a lista se criar a transação falhar", async () => {
    const { item } = await queuedItemAndTxData();

    await expect(
      approveNotification(item.id, () => Promise.reject(new Error("falha ao salvar")))
    ).rejects.toThrow("falha ao salvar");

    const pending = await getPendingApprovalNotifications();
    expect(pending.map((p) => p.id)).toEqual([item.id]);
    expect(await countTransactions()).toBe(0);
  });
});
