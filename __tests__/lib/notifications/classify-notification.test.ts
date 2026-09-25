import { classifyNotification, type NotificationInput } from "@/lib/notifications/parsers";

function input(packageName: string, title: string, text: string): NotificationInput {
  return { packageName, title, text, bigText: null, subText: null, postTime: 1_719_064_800_000 };
}

describe("classifyNotification", () => {
  it("interpreta uma compra reconhecida", () => {
    const result = classifyNotification(input("com.nu.production", "Compra aprovada", "Compra aprovada de R$ 12,50 em CAFE."));
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.transaction.amount).toBe(12.5);
      expect(result.transaction.bank).toBe("Nubank");
    }
  });

  it("ignora app não monitorado", () => {
    const result = classifyNotification(input("com.whatsapp", "Maria", "Te enviei R$ 10,00"));
    expect(result).toEqual({ status: "ignored", reason: "app não monitorado: com.whatsapp" });
  });

  it("ignora notificação do próprio app", () => {
    expect(classifyNotification(input("com.thejhou.kilun", "Kilun", "Backup de R$ 1,00")).status).toBe("ignored");
  });

  it("ignora regra de exclusão absoluta mesmo com valor", () => {
    const result = classifyNotification(input("com.nu.production", "Nubank", "Compra recusada de R$ 99,00"));
    expect(result.status).toBe("ignored");
  });

  it("interpreta a transação mesmo com o saldo citado no fim", () => {
    const result = classifyNotification(input("br.com.bb.android", "BB", "Pix de R$ 150,00 recebido. Saldo atual R$ 900,00"));
    expect(result.status).toBe("parsed");
  });

  it("marca como não reconhecida a exclusão por contexto quando há valor sem verbo", () => {
    const result = classifyNotification(input("br.com.bb.android", "BB", "Pix de R$ 150,00. Saldo atual R$ 900,00"));
    expect(result).toEqual({ status: "unrecognized", reason: "regra de exclusão: /saldo\\s+atual/" });
  });

  it("ignora exclusão por contexto sem valor", () => {
    const result = classifyNotification(input("com.itau", "Itaú", "Confira seu saldo no app"));
    expect(result).toEqual({ status: "ignored", reason: "regra de exclusão: /seu\\s+saldo/" });
  });

  it("ignora texto sem valor em R$", () => {
    const result = classifyNotification(input("com.itau", "Itaú", "Novidades no app"));
    expect(result).toEqual({ status: "ignored", reason: "sem valor em R$" });
  });

  it("reconhece o C6 pelos dois nomes de pacote", () => {
    for (const pkg of ["com.c6bank.app", "com.ctsi.android.app.privatelabel.c6bank"]) {
      const result = classifyNotification(input(pkg, "C6", "Compra de R$ 30,00 em LOJA."));
      expect(result.status).toBe("parsed");
    }
  });
});
