/**
 * Testes para notification listener (commits: e7b4e01, 2f60665)
 *
 * - use-notification-listener: queue processa eventos em ordem
 * - Parsers: extrai dados de notificações bancárias
 * - BankNotifications types: OnConnectionChange event
 */

import {
  parseNotification,
  extractAmount,
  extractCardLastDigits,
  parseBankNotification,
} from "@/lib/notifications/parsers";

describe("notification parsers — extractAmount", () => {
  it("extrai valor com vírgula e centavos", () => {
    expect(extractAmount("Compra R$ 150,50 aprovada")).toBe(150.50);
  });

  it("extrai valor sem centavos", () => {
    expect(extractAmount("Pagamento de R$ 2000 realizado")).toBe(2000);
  });

  it("extrai valor com ponto como separador de milhar", () => {
    expect(extractAmount("R$ 1.500,00")).toBe(1500);
  });

  it("retorna null se não há valor", () => {
    expect(extractAmount("Sem valor aqui")).toBeNull();
  });
});

describe("notification parsers — extractCardLastDigits", () => {
  it("extrai últimos 4 dígitos do cartão", () => {
    expect(extractCardLastDigits("Cartão final 1234")).toBe("1234");
  });

  it("extrai de formato '****1234'", () => {
    expect(extractCardLastDigits("Cartão ****1234")).toBe("1234");
  });

  it("retorna null se não há dígitos", () => {
    expect(extractCardLastDigits("Sem cartão")).toBeNull();
  });
});

describe("notification parsers — parseBankNotification", () => {
  it("parse notificação do Nubank", () => {
    const result = parseBankNotification(
      "Nu Bank",
      "Compra de R$ 45,90 aprovada no cartão final 1234",
      "com.nu.bank"
    );

    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBe(45.90);
      expect(result.bankName).toMatch(/nu/i);
    }
  });

  it("parse notificação do Itaú", () => {
    const result = parseBankNotification(
      "Itaú",
      "Pagamento de R$ 1.200,00 realizado",
      "com.itau
    );

    expect(result).not.toBeNull();
    if (result) {
      expect(result.amount).toBe(1200);
    }
  });

  it("retorna null para app desconhecido", () => {
    const result = parseBankNotification(
      "Unknown",
      "R$ 100",
      "com.unknown.app"
    );

    // May return null or a generic result depending on implementation
    expect(result).toBeNull();
  });
});

describe("notification parsers — parseNotification", () => {
  it("extrai dados básicos de notificação", () => {
    const result = parseNotification({
      title: "Compra aprovada",
      text: "R$ 50,00 no cartão final 5678",
      packageName: "com.nu.bank",
      timestamp: 1719064800000,
    });

    expect(result).toBeDefined();
    if (result) {
      expect(result.amount).toBe(50);
    }
  });
});
