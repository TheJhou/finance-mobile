import {
  BANK_APPS,
  inferCategoryFromText,
  isKnownBank,
  isOwnApp,
  OWN_APP_PACKAGE,
  parseNotification,
} from "@/lib/notifications/parsers";
import type { NotificationInput } from "@/lib/notifications/parsers";

describe("notifications parsers", () => {
  describe("isKnownBank", () => {
    it("returns true for registered bank package names", () => {
      expect(isKnownBank("com.nu.production")).toBe(true);
      expect(isKnownBank("com.itau")).toBe(true);
      expect(isKnownBank("com.bradesco")).toBe(true);
    });

    it("returns false for unknown packages", () => {
      expect(isKnownBank("com.whatsapp")).toBe(false);
      expect(isKnownBank("com.facebook")).toBe(false);
    });
  });

  describe("isOwnApp", () => {
    it("returns true for own app package", () => {
      expect(isOwnApp(OWN_APP_PACKAGE)).toBe(true);
    });

    it("returns false for other packages", () => {
      expect(isOwnApp("com.nu.production")).toBe(false);
    });
  });

  describe("parseNotification — ignores own app", () => {
    it("returns null for own app notifications", () => {
      const result = parseNotification({
        packageName: OWN_APP_PACKAGE,
        title: "teste",
        text: "texto",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });
  });

  describe("parseNotification — ignores unknown banks", () => {
    it("returns null for unknown packages", () => {
      const result = parseNotification({
        packageName: "com.whatsapp",
        title: "teste",
        text: "R$ 100,00",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });
  });

  describe("parseNotification — ignores marketing notifications", () => {
    it("ignores fatura fecha notifications", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Sua fatura fecha amanhã",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });

    it("ignores saldo atual notifications", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Seu saldo atual é R$ 1.234,56",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });

    it("ignores promoção disponível notifications", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Nova promoção disponível",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });

    it("ignores cupom notifications", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Você recebeu um cupom de desconto",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });
  });

  describe("parseNotification — Nubank", () => {
    it("parses compra aprovada com local", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Compra aprovada de R$ 150,00 em Supermercado",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(150);
      expect(result!.description).toBe("Supermercado");
      expect(result!.type).toBe("EXPENSE");
      expect(result!.paymentMethod).toBe("CREDIT_CARD");
      expect(result!.bank).toBe("Nubank");
    });

    it("parses compra aprovada sem local", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Compra aprovada de R$ 45,00",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(45);
      expect(result!.description).toBe("Compra");
    });

    it("parses Pix recebido", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Você recebeu um Pix de R$ 300,00 de João Silva.",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(300);
      expect(result!.type).toBe("INCOME");
      expect(result!.paymentMethod).toBe("PIX");
    });

    it("parses Pix enviado", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Pix enviado de R$ 50,00 para Maria.",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(50);
      expect(result!.type).toBe("EXPENSE");
      expect(result!.paymentMethod).toBe("PIX");
    });
  });

  describe("parseNotification — genérico", () => {
    it("parses generic debit notification as EXPENSE", () => {
      const result = parseNotification({
        packageName: "com.bradesco",
        title: "Bradesco",
        text: "Débito realizado no valor de R$ 89,90 em PADARIA",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(89.9);
      expect(result!.type).toBe("EXPENSE");
      expect(result!.bank).toBe("Bradesco");
    });

    it("parses generic credit received as INCOME", () => {
      const result = parseNotification({
        packageName: "com.itau",
        title: "Itaú",
        text: "Crédito recebido no valor de R$ 5.000,00",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(5000);
      expect(result!.type).toBe("INCOME");
    });

    it("parses generic credit card purchase as EXPENSE", () => {
      const result = parseNotification({
        packageName: "com.bradesco",
        title: "Bradesco",
        text: "Compra no crédito de R$ 120,00 em RESTAURANTE",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(120);
      expect(result!.type).toBe("EXPENSE");
      expect(result!.paymentMethod).toBe("CREDIT_CARD");
      expect(result!.bank).toBe("Bradesco");
    });

    it("parses generic debit card purchase as EXPENSE", () => {
      const result = parseNotification({
        packageName: "com.itau",
        title: "Itaú",
        text: "Compra no débito de R$ 45,67 em PADARIA",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(45.67);
      expect(result!.type).toBe("EXPENSE");
      expect(result!.paymentMethod).toBe("DEBIT_CARD");
      expect(result!.bank).toBe("Itaú");
    });

    it("does not ignore transaction notification containing saldo keyword", () => {
      const result = parseNotification({
        packageName: "com.bradesco",
        title: "Bradesco",
        text: "Compra aprovada de R$ 89,90 em SUPERMERCADO. Saldo atual R$ 1.234,56",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(89.9);
      expect(result!.type).toBe("EXPENSE");
      expect(result!.paymentMethod).toBe("CREDIT_CARD");
    });

    it("parses generic bank transfer received as INCOME", () => {
      const result = parseNotification({
        packageName: "com.itau",
        title: "Itaú",
        text: "Transferência recebida de R$ 2.000,00 de João Silva",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(2000);
      expect(result!.type).toBe("INCOME");
      expect(result!.paymentMethod).toBe("BANK_TRANSFER");
    });

    it("returns null when no amount is found", () => {
      const result = parseNotification({
        packageName: "com.nu.production",
        title: "Nubank",
        text: "Acesse o app para ver mais",
        bigText: null,
        subText: null,
        postTime: Date.now(),
      });
      expect(result).toBeNull();
    });
  });

  describe("inferCategoryFromText", () => {
    it("infers Alimentação from mercado", () => {
      expect(inferCategoryFromText("Compra no mercado")).toBe("Alimentação");
    });

    it("infers Transporte from gasolina", () => {
      expect(inferCategoryFromText("Abasteceu gasolina no posto")).toBe("Transporte");
    });

    it("infers Assinaturas from netflix", () => {
      expect(inferCategoryFromText("Netflix cobrança")).toBe("Assinaturas");
    });

    it("returns Transferência for bank context without strong match", () => {
      expect(inferCategoryFromText("Pix enviado para João")).toBe("Transferência");
    });

    it("returns null for completely generic text", () => {
      expect(inferCategoryFromText("Olá, tudo bem?")).toBeNull();
    });

    it("penalizes generic mercado in bank context", () => {
      expect(inferCategoryFromText("Pix enviado para mercado")).toBe("Transferência");
    });
  });

  describe("BANK_APPS", () => {
    it("contains at least 10 known banks", () => {
      expect(Object.keys(BANK_APPS).length).toBeGreaterThanOrEqual(10);
    });

    it("contains Nubank", () => {
      expect(BANK_APPS["com.nu.production"]).toBe("Nubank");
    });
  });
});
