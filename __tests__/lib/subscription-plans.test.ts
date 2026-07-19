/**
 * Testes para subscription-plans.ts (commit: 79cc71a)
 *
 * - PLANS: FREE/PRO com tokenLimit do env
 * - getPlanByCode
 * - formatPrice
 * - getTokenDisplayText
 * - isFeatureAvailable
 * - getFeatureDisplayValue
 * - PLAY_STORE_TEXTS inclui token limits dinâmicos
 */

import {
  PLANS,
  PLAY_STORE_TEXTS,
  SUBSCRIPTION_CONFIG,
  getPlanByCode,
  getFeatureDisplayValue,
  getTokenDisplayText,
  isFeatureAvailable,
  formatPrice,
} from "@/lib/subscription-plans";

describe("subscription-plans — PLANS", () => {
  it("FREE tem code FREE e tokenLimit positivo", () => {
    expect(PLANS.FREE.code).toBe("FREE");
    expect(PLANS.FREE.tokenLimit).toBeGreaterThan(0);
  });

  it("PRO tem code PRO e tokenLimit maior que FREE", () => {
    expect(PLANS.PRO.code).toBe("PRO");
    expect(PLANS.PRO.tokenLimit).toBeGreaterThan(PLANS.FREE.tokenLimit);
  });

  it("PRO tem price 3.00 e priceDisplay R$ 3,00", () => {
    expect(PLANS.PRO.price).toBe(3.00);
    expect(PLANS.PRO.priceDisplay).toContain("3,00");
  });

  it("FREE tem price 0", () => {
    expect(PLANS.FREE.price).toBe(0);
  });

  it("PRO tem badge e popular true", () => {
    expect(PLANS.PRO.badge).toBe("PRO");
    expect(PLANS.PRO.popular).toBe(true);
  });

  it("ambos planos têm features array não-vazio", () => {
    expect(PLANS.FREE.features.length).toBeGreaterThan(0);
    expect(PLANS.PRO.features.length).toBeGreaterThan(0);
  });

  it("OCR, Excel e PDF são PRO-only (free=false, pro=true)", () => {
    const ocr = PLANS.PRO.features.find(f => f.label.includes("OCR"));
    const xlsx = PLANS.PRO.features.find(f => f.label.includes("Excel"));
    const pdf = PLANS.PRO.features.find(f => f.label.includes("PDF"));

    expect(ocr?.free).toBe(false);
    expect(ocr?.pro).toBe(true);
    expect(xlsx?.free).toBe(false);
    expect(xlsx?.pro).toBe(true);
    expect(pdf?.free).toBe(false);
    expect(pdf?.pro).toBe(true);
  });
});

describe("subscription-plans — getPlanByCode", () => {
  it("retorna FREE para 'FREE'", () => {
    expect(getPlanByCode("FREE")?.code).toBe("FREE");
  });

  it("retorna PRO para 'PRO'", () => {
    expect(getPlanByCode("PRO")?.code).toBe("PRO");
  });

  it("retorna null para código inválido", () => {
    expect(getPlanByCode("INVALID")).toBeNull();
  });
});

describe("subscription-plans — formatPrice", () => {
  it("formata 3.00 como R$ 3,00", () => {
    const result = formatPrice(3.00);
    expect(result).toContain("R$");
    expect(result).toContain("3,00");
  });

  it("formata 0 como R$ 0,00", () => {
    const result = formatPrice(0);
    expect(result).toContain("0,00");
  });
});

describe("subscription-plans — getTokenDisplayText", () => {
  it("retorna '100K' para 100000", () => {
    expect(getTokenDisplayText(100000)).toBe("100K");
  });

  it("retorna '30.0M' para 30000000", () => {
    expect(getTokenDisplayText(30000000)).toBe("30.0M");
  });

  it("retorna string direta para < 1000", () => {
    expect(getTokenDisplayText(500)).toBe("500");
  });
});

describe("subscription-plans — isFeatureAvailable", () => {
  it("retorna true para boolean true", () => {
    expect(isFeatureAvailable(true)).toBe(true);
  });

  it("retorna true para string 'Ilimitado'", () => {
    expect(isFeatureAvailable("Ilimitado")).toBe(true);
  });

  it("retorna false para boolean false", () => {
    expect(isFeatureAvailable(false)).toBe(false);
  });

  it("retorna false para string '300/mês'", () => {
    expect(isFeatureAvailable("300/mês")).toBe(false);
  });
});

describe("subscription-plans — getFeatureDisplayValue", () => {
  it("retorna ✓ para true", () => {
    expect(getFeatureDisplayValue(true)).toBe("✓");
  });

  it("retorna ✗ para false", () => {
    expect(getFeatureDisplayValue(false)).toBe("✗");
  });

  it("retorna string direta para outros valores", () => {
    expect(getFeatureDisplayValue("Ilimitado")).toBe("Ilimitado");
    expect(getFeatureDisplayValue("300/mês")).toBe("300/mês");
  });
});

describe("subscription-plans — PLAY_STORE_TEXTS", () => {
  it("inclui token limit do plano FREE na descrição", () => {
    expect(PLAY_STORE_TEXTS.appFullDescription).toContain(
      PLANS.FREE.tokenLimit.toLocaleString("pt-BR")
    );
  });

  it("inclui token limit do plano PRO na descrição", () => {
    expect(PLAY_STORE_TEXTS.appFullDescription).toContain(
      PLANS.PRO.tokenLimit.toLocaleString("pt-BR")
    );
  });

  it("inclui preço R$ 3,00/mês", () => {
    expect(PLAY_STORE_TEXTS.subscriptionPrice).toContain("3,00");
  });

  it("inclui info de cancelamento", () => {
    expect(PLAY_STORE_TEXTS.cancellation).toMatch(/cancel/i);
  });
});

describe("subscription-plans — SUBSCRIPTION_CONFIG", () => {
  it("tem purchaseUrl", () => {
    expect(SUBSCRIPTION_CONFIG.purchaseUrl).toBeDefined();
    expect(SUBSCRIPTION_CONFIG.purchaseUrl.length).toBeGreaterThan(0);
  });

  it("tem termsUrl e privacyUrl", () => {
    expect(SUBSCRIPTION_CONFIG.termsUrl).toBeDefined();
    expect(SUBSCRIPTION_CONFIG.privacyUrl).toBeDefined();
  });
});
