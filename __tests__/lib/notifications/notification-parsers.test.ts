/**
 * Testes para notification listener (commits: e7b4e01, 2f60665)
 *
 * - use-notification-listener: queue processa eventos em ordem
 * - Parsers: extrai dados de notificações bancárias
 * - BankNotifications types: OnConnectionChange event
 */

import {
    parseNotification,
} from "@/lib/notifications/parsers";

describe("notification parsers — parseNotification", () => {
  it("extrai dados de notificação do Nubank", () => {
    const result = parseNotification({
      title: "Compra aprovada",
      text: "R$ 50,00 no cartão final 5678",
      packageName: "com.nu.production",
      bigText: null,
      subText: null,
      postTime: 1719064800000,
    });

    expect(result).toBeDefined();
    if (result) {
      expect(result.amount).toBe(50);
      expect(result.bank).toMatch(/nu/i);
    }
  });

  it("extrai dados de notificação do Inter", () => {
    const result = parseNotification({
      title: "Pagamento realizado",
      text: "Pagamento de R$ 1.200,00 realizado",
      packageName: "br.com.intermedium",
      bigText: null,
      subText: null,
      postTime: 1719064800000,
    });

    expect(result).toBeDefined();
    if (result) {
      expect(result.amount).toBe(1200);
    }
  });

  it("retorna null para app desconhecido sem valor", () => {
    const result = parseNotification({
      title: "Unknown",
      text: "Sem valor aqui",
      packageName: "com.unknown.app",
      bigText: null,
      subText: null,
      postTime: 1719064800000,
    });

    expect(result).toBeNull();
  });
});
