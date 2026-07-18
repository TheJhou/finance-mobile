/**
 * Testes unitários para validateNotificationAiPayload
 * Executar: node --experimental-vm-modules --import tsx/esm __tests__/lib/notifications/validate-ai-payload.test.ts
 * Ou via: node --test __tests__/lib/notifications/validate-ai-payload.test.ts (requer compilação)
 *
 * Use: npx ts-node -r tsconfig-paths/register __tests__/lib/notifications/validate-ai-payload.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import {
  VALID_PAYMENT_METHODS,
  validateNotificationAiPayload,
} from "@/lib/notifications/validate-ai-payload";

// ── Fixtures ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  { id: "cat-1", name: "Alimentação" },
  { id: "cat-2", name: "Transporte" },
];

const VALID_CONTEXT = { bank: "Nubank", paymentMethod: "PIX" };

const VALID_RAW_TEXT =
  "Compra aprovada de R$ 45,90 em iFood. Saldo disponível: R$ 1.200,00";

// ── Helper ─────────────────────────────────────────────────────────────────

function validate(overrides: {
  rawText?: string;
  categories?: Array<{ id: string; name: string }>;
  context?: { bank?: string; paymentMethod?: string };
} = {}) {
  return validateNotificationAiPayload(
    overrides.rawText ?? VALID_RAW_TEXT,
    overrides.categories ?? VALID_CATEGORIES,
    overrides.context ?? VALID_CONTEXT,
    "processNotification"
  );
}

// ── Payload válido ─────────────────────────────────────────────────────────

describe("payload válido", () => {
  it("retorna valid=true sem erros nem warnings quando tudo está correto", () => {
    const result = validate();
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it("aceita todos os paymentMethods válidos do enum", () => {
    for (const pm of VALID_PAYMENT_METHODS) {
      const result = validate({ context: { bank: "Nubank", paymentMethod: pm } });
      assert.equal(result.valid, true, `Falhou para paymentMethod: ${pm}`);
      assert.equal(result.errors.length, 0);
    }
  });

  it("aceita todos os bancos conhecidos do BANK_APPS", () => {
    const knownBanks = [
      "Nubank", "Inter", "PicPay", "C6 Bank", "Mercado Pago",
      "Itaú", "Itaú Empresas", "Bradesco", "Santander", "Banco do Brasil",
      "Caixa", "XP", "BTG", "Neon", "Next",
    ];
    for (const bank of knownBanks) {
      const result = validate({ context: { bank, paymentMethod: "PIX" } });
      assert.equal(result.valid, true, `Falhou para banco: ${bank}`);
    }
  });

  it("funciona com uma única categoria", () => {
    const result = validate({ categories: [{ id: "cat-1", name: "Outros" }] });
    assert.equal(result.valid, true);
  });
});

// ── rawText ────────────────────────────────────────────────────────────────

describe("rawText", () => {
  it("retorna erro quando rawText está vazio", () => {
    const result = validate({ rawText: "" });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("rawText está vazio")),
      `Esperado erro sobre rawText vazio. Erros: ${result.errors.join(", ")}`
    );
  });

  it("retorna erro quando rawText é só espaços", () => {
    const result = validate({ rawText: "   " });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("rawText está vazio")));
  });

  it("retorna warning quando rawText tem menos de 10 caracteres", () => {
    const result = validate({ rawText: "R$ 50,00" }); // 8 chars
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(
      result.warnings.some((w) => w.includes("rawText muito curto")),
      `Esperado warning sobre rawText curto. Warnings: ${result.warnings.join(", ")}`
    );
  });

  it("não emite warning para rawText com exatamente 10 caracteres", () => {
    const result = validate({ rawText: "R$ 50,0000" }); // 10 chars
    assert.equal(result.valid, true);
    assert.ok(!result.warnings.some((w) => w.includes("rawText muito curto")));
  });

  it("aceita rawText longo sem problema", () => {
    const result = validate({ rawText: "A".repeat(200) });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});

// ── categories ────────────────────────────────────────────────────────────

describe("categories", () => {
  it("retorna erro quando categories é array vazio", () => {
    const result = validate({ categories: [] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("categories está vazio")));
  });

  it("retorna erro quando alguma categoria não tem id", () => {
    const result = validate({
      categories: [{ id: "", name: "Alimentação" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("categoria(s) com id ou name ausente")));
  });

  it("retorna erro quando alguma categoria não tem name", () => {
    const result = validate({
      categories: [{ id: "cat-1", name: "" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("categoria(s) com id ou name ausente")));
  });

  it("conta corretamente múltiplas categorias inválidas", () => {
    const result = validate({
      categories: [
        { id: "", name: "Ok" },
        { id: "cat-2", name: "" },
        { id: "cat-3", name: "Válida" },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("2 categoria(s)")));
  });

  it("retorna erro se ao menos uma categoria for inválida", () => {
    const result = validate({
      categories: [
        { id: "cat-1", name: "Válida" },
        { id: "", name: "" },
      ],
    });
    assert.equal(result.valid, false);
  });
});

// ── context.bank ──────────────────────────────────────────────────────────

describe("context.bank", () => {
  it("emite warning quando bank está ausente", () => {
    const result = validate({ context: { paymentMethod: "PIX" } });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("context.bank ausente")));
  });

  it("emite warning quando bank é string vazia", () => {
    const result = validate({ context: { bank: "", paymentMethod: "PIX" } });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("context.bank ausente")));
  });

  it("emite warning (não erro) quando bank não está em BANK_APPS", () => {
    const result = validate({
      context: { bank: "BancoDesconhecido", paymentMethod: "PIX" },
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.some((w) => w.includes("context.bank desconhecido")));
  });
});

// ── context.paymentMethod ─────────────────────────────────────────────────

describe("context.paymentMethod", () => {
  it("emite warning quando paymentMethod está ausente", () => {
    const result = validate({ context: { bank: "Nubank" } });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("context.paymentMethod ausente")));
  });

  it("emite warning quando paymentMethod é string vazia", () => {
    const result = validate({ context: { bank: "Nubank", paymentMethod: "" } });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("context.paymentMethod ausente")));
  });

  it("retorna erro para paymentMethod fora do enum", () => {
    const result = validate({
      context: { bank: "Nubank", paymentMethod: "CARTAO_INVALIDO" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("context.paymentMethod inválido")));
  });

  it("retorna erro para paymentMethod em lowercase (enum é case-sensitive)", () => {
    const result = validate({
      context: { bank: "Nubank", paymentMethod: "pix" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("context.paymentMethod inválido")));
  });
});

// ── Múltiplos erros simultâneos ────────────────────────────────────────────

describe("múltiplos erros", () => {
  it("acumula todos os erros em um único retorno", () => {
    const result = validate({
      rawText: "",
      categories: [],
      context: { paymentMethod: "INVALIDO" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, `Esperado >= 3 erros, got ${result.errors.length}`);
  });

  it("acumula erros e warnings ao mesmo tempo", () => {
    const result = validate({
      rawText: "curto", // warning (5 chars)
      categories: [],   // erro
      context: { bank: "Nubank", paymentMethod: "PIX" },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
    assert.ok(result.warnings.length >= 1);
  });
});

// ── origin ────────────────────────────────────────────────────────────────

describe("origin", () => {
  it("aceita origin=processNotification", () => {
    const result = validateNotificationAiPayload(
      VALID_RAW_TEXT,
      VALID_CATEGORIES,
      VALID_CONTEXT,
      "processNotification"
    );
    assert.equal(result.valid, true);
  });

  it("aceita origin=retryPendingAiEnrichment", () => {
    const result = validateNotificationAiPayload(
      VALID_RAW_TEXT,
      VALID_CATEGORIES,
      VALID_CONTEXT,
      "retryPendingAiEnrichment"
    );
    assert.equal(result.valid, true);
  });
});
