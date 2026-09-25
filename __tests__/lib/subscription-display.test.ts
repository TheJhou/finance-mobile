import { describeSubscription, getCancelDialogMessage, getUsagePercent } from "@/lib/subscription-display";
import type { SubscriptionStatus } from "@/lib/types";

const END = "2026-10-12T12:00:00.000Z";

function status(overrides: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    plan: { code: "PRO", name: "Pro", tokenLimit: 30_000_000 },
    usage: { used: 0, limit: 30_000_000, remaining: 30_000_000, period: "2026-09", resetsAt: "2026-10-01T00:00:00.000Z" },
    subscription: { state: "ACTIVE", provider: "GOOGLE_PLAY", currentPeriodEnd: END, autoRenewing: true },
    backups: { used: 2, limit: 30 },
    ...overrides,
  };
}

describe("describeSubscription", () => {
  it("PRO ativa mostra a data de renovação", () => {
    expect(describeSubscription(status())).toEqual({
      isPro: true,
      badge: "ATIVA",
      tone: "success",
      title: "Kilun Pro",
      detail: "Renova em 12/10/2026",
    });
  });

  it("PRO cancelada mostra até quando vale", () => {
    const headline = describeSubscription(
      status({ subscription: { state: "CANCELED_PENDING_END", provider: "GOOGLE_PLAY", currentPeriodEnd: END, autoRenewing: false } })
    );
    expect(headline.badge).toBe("CANCELADA");
    expect(headline.tone).toBe("warning");
    expect(headline.detail).toBe("Pro até 12/10/2026. Depois volta ao plano gratuito.");
  });

  it("carência pede para atualizar o pagamento", () => {
    const headline = describeSubscription(
      status({ subscription: { state: "GRACE", provider: "GOOGLE_PLAY", currentPeriodEnd: END, autoRenewing: true } })
    );
    expect(headline.badge).toBe("PAGAMENTO PENDENTE");
    expect(headline.tone).toBe("danger");
    expect(headline.detail).toMatch(/forma de pagamento na Google Play/);
  });

  it("PRO de backend antigo, sem detalhes da assinatura", () => {
    const headline = describeSubscription(status({ subscription: undefined }));
    expect(headline).toMatchObject({ isPro: true, badge: "ATIVA", detail: null });
  });

  it("FREE", () => {
    const headline = describeSubscription(
      status({ plan: { code: "FREE", name: "Grátis", tokenLimit: 100_000 }, subscription: null })
    );
    expect(headline).toMatchObject({ isPro: false, badge: "GRÁTIS", title: "Plano Gratuito" });
  });

  it("offline não finge ser o plano gratuito do usuário", () => {
    const headline = describeSubscription(
      status({ offline: true, plan: { code: "FREE", name: "Grátis", tokenLimit: 100_000 }, subscription: null })
    );
    expect(headline).toMatchObject({ badge: "OFFLINE", title: "Assinatura indisponível" });
  });
});

describe("getUsagePercent", () => {
  it("arredonda e limita a 100%", () => {
    expect(getUsagePercent(status({ usage: { used: 62_345, limit: 100_000, remaining: 0, period: "", resetsAt: "" } }))).toBe(62);
    expect(getUsagePercent(status({ usage: { used: 200_000, limit: 100_000, remaining: 0, period: "", resetsAt: "" } }))).toBe(100);
    expect(getUsagePercent(status({ usage: { used: 10, limit: 0, remaining: 0, period: "", resetsAt: "" } }))).toBe(0);
  });
});

describe("getCancelDialogMessage", () => {
  it("explica que o cancelamento é na Google Play e até quando o Pro vale", () => {
    const message = getCancelDialogMessage(status());
    expect(message).toMatch(/Google Play/);
    expect(message).toMatch(/Pro até 12\/10\/2026/);
    expect(message).not.toMatch(/backups na nuvem/);
  });

  it("avisa quando há mais backups do que o plano gratuito guarda", () => {
    const message = getCancelDialogMessage(status({ backups: { used: 12, limit: 30 } }));
    expect(message).toMatch(/Você tem 12 backups na nuvem; o plano gratuito guarda 3/);
  });
});
