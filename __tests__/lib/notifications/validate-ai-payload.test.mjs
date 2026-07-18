/**
 * Testes unitários para a lógica de validateNotificationAiPayload
 * Executar: node --test __tests__/lib/notifications/validate-ai-payload.test.mjs
 *
 * Autocontido: replica a lógica da função sem precisar de compilação TypeScript.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ── Replica de BANK_APPS (lib/notifications/parsers.ts) ───────────────────

const BANK_APPS = {
  "com.nu.production": "Nubank",
  "br.com.intermedium": "Inter",
  "com.picpay": "PicPay",
  "com.ctsi.android.app.privatelabel.c6bank": "C6 Bank",
  "com.mercadopago.wallet": "Mercado Pago",
  "com.itau": "Itaú",
  "com.itau.empresas": "Itaú Empresas",
  "com.bradesco": "Bradesco",
  "com.santander.app": "Santander",
  "br.com.bb.android": "Banco do Brasil",
  "br.com.gabba.Caixa": "Caixa",
  "br.com.xp.carteira": "XP",
  "com.btg.pactual.pdigital": "BTG",
  "br.com.neon": "Neon",
  "br.com.next": "Next",
  "br.com.willbank": "Will Bank",
  "com.recargapay": "RecargaPay",
  "com.ame.digital": "Ame Digital",
  "br.com.pagseguro.app": "PagBank",
};

// ── Replica de VALID_PAYMENT_METHODS (lib/notifications/validate-ai-payload.ts) ──

const VALID_PAYMENT_METHODS = [
  "CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX",
  "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER",
];

// ── Replica da função validateNotificationAiPayload ───────────────────────

function validateNotificationAiPayload(rawText, categories, context, origin) {
  const errors = [];
  const warnings = [];

  // rawText
  if (!rawText || rawText.trim().length === 0) {
    errors.push("rawText está vazio — a IA não terá texto para processar");
  } else if (rawText.trim().length < 10) {
    warnings.push(`rawText muito curto (${rawText.trim().length} chars): "${rawText.trim()}"`);
  }

  // categories — backend aceita default([]), apenas avisa
  if (!categories || categories.length === 0) {
    warnings.push("categories está vazio — IA categorizará sem sugestões");
  } else {
    const invalid = categories.filter((c) => !c.id || !c.name);
    if (invalid.length > 0) {
      warnings.push(`${invalid.length} categoria(s) com id ou name ausente`);
    }
  }

  // context.bank
  if (!context.bank || context.bank.trim().length === 0) {
    warnings.push("context.bank ausente — IA processará sem contexto de banco");
  } else {
    const knownBanks = Object.values(BANK_APPS);
    if (!knownBanks.includes(context.bank)) {
      warnings.push(`context.bank desconhecido: "${context.bank}"`);
    }
  }

  // context.paymentMethod
  if (!context.paymentMethod || context.paymentMethod.trim().length === 0) {
    warnings.push("context.paymentMethod ausente — IA inferirá sem contexto");
  } else if (!VALID_PAYMENT_METHODS.includes(context.paymentMethod)) {
    // context é opcional no backend — vira aviso, não bloqueia
    warnings.push(`context.paymentMethod desconhecido: "${context.paymentMethod}"`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  { id: "cat-1", name: "Alimentação" },
  { id: "cat-2", name: "Transporte" },
];
const VALID_CONTEXT = { bank: "Nubank", paymentMethod: "PIX" };
const VALID_TEXT = "Compra aprovada de R$ 45,90 em iFood. Saldo disponível: R$ 1.200,00";

function validate(overrides = {}) {
  return validateNotificationAiPayload(
    overrides.rawText    ?? VALID_TEXT,
    overrides.categories ?? VALID_CATEGORIES,
    overrides.context    ?? VALID_CONTEXT,
    overrides.origin     ?? "processNotification"
  );
}

// ── Testes ────────────────────────────────────────────────────────────────

describe("payload válido", () => {
  it("retorna valid=true sem erros nem warnings com dados corretos", () => {
    const r = validate();
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.equal(r.warnings.length, 0);
  });

  it("aceita todos os paymentMethods do enum", () => {
    for (const pm of VALID_PAYMENT_METHODS) {
      const r = validate({ context: { bank: "Nubank", paymentMethod: pm } });
      assert.equal(r.valid, true, `Falhou para: ${pm}`);
      assert.equal(r.errors.length, 0, `Erro inesperado para: ${pm}`);
    }
  });

  it("aceita todos os bancos conhecidos do BANK_APPS", () => {
    for (const bank of Object.values(BANK_APPS)) {
      const r = validate({ context: { bank, paymentMethod: "PIX" } });
      assert.equal(r.valid, true, `Falhou para banco: ${bank}`);
      assert.equal(r.errors.length, 0);
    }
  });

  it("funciona com uma única categoria válida", () => {
    const r = validate({ categories: [{ id: "cat-1", name: "Outros" }] });
    assert.equal(r.valid, true);
  });

  it("aceita origin=retryPendingAiEnrichment", () => {
    const r = validate({ origin: "retryPendingAiEnrichment" });
    assert.equal(r.valid, true);
  });
});

describe("rawText", () => {
  it("erro: rawText vazio", () => {
    const r = validate({ rawText: "" });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes("rawText está vazio")));
  });

  it("erro: rawText só com espaços", () => {
    const r = validate({ rawText: "   " });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes("rawText está vazio")));
  });

  it("warning: rawText com menos de 10 chars (sem erro)", () => {
    const r = validate({ rawText: "R$ 50,00" }); // 8 chars
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("rawText muito curto")));
  });

  it("sem warning para rawText com exatamente 10 chars", () => {
    const r = validate({ rawText: "R$ 50,0000" }); // 10 chars
    assert.equal(r.valid, true);
    assert.ok(!r.warnings.some((w) => w.includes("rawText muito curto")));
  });

  it("aceita rawText longo (200 chars)", () => {
    const r = validate({ rawText: "A".repeat(200) });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
  });
});

describe("categories", () => {
  it("warning (não erro): categories vazio — backend aceita default([])", () => {
    const r = validate({ categories: [] });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("categories está vazio")));
  });

  it("warning (não erro): categoria sem id", () => {
    const r = validate({ categories: [{ id: "", name: "Alimentação" }] });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("categoria(s) com id ou name ausente")));
  });

  it("warning (não erro): categoria sem name", () => {
    const r = validate({ categories: [{ id: "cat-1", name: "" }] });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("categoria(s) com id ou name ausente")));
  });

  it("conta corretamente 2 categorias inválidas no warning", () => {
    const r = validate({
      categories: [
        { id: "", name: "Ok" },
        { id: "cat-2", name: "" },
        { id: "cat-3", name: "Válida" },
      ],
    });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("2 categoria(s)")));
  });

  it("warning mesmo com mistura de válidas e inválidas", () => {
    const r = validate({
      categories: [
        { id: "cat-1", name: "Válida" },
        { id: "", name: "" },
      ],
    });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("categoria(s) com id ou name ausente")));
  });
});

describe("context.bank", () => {
  it("warning: bank ausente (não é erro)", () => {
    const r = validate({ context: { paymentMethod: "PIX" } });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("context.bank ausente")));
  });

  it("warning: bank string vazia", () => {
    const r = validate({ context: { bank: "", paymentMethod: "PIX" } });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("context.bank ausente")));
  });

  it("warning: bank não está em BANK_APPS (não é erro)", () => {
    const r = validate({ context: { bank: "BancoDesconhecido", paymentMethod: "PIX" } });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("context.bank desconhecido")));
  });
});

describe("context.paymentMethod", () => {
  it("warning: paymentMethod ausente (não é erro)", () => {
    const r = validate({ context: { bank: "Nubank" } });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("context.paymentMethod ausente")));
  });

  it("warning: paymentMethod string vazia", () => {
    const r = validate({ context: { bank: "Nubank", paymentMethod: "" } });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes("context.paymentMethod ausente")));
  });

  it("warning (não erro): paymentMethod fora do enum — context é opcional no backend", () => {
    const r = validate({ context: { bank: "Nubank", paymentMethod: "CARTAO_INVALIDO" } });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("context.paymentMethod desconhecido")));
  });

  it("warning (não erro): paymentMethod em lowercase (enum é case-sensitive)", () => {
    const r = validate({ context: { bank: "Nubank", paymentMethod: "pix" } });
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.some((w) => w.includes("context.paymentMethod desconhecido")));
  });
});

describe("múltiplos avisos simultâneos", () => {
  it("rawText vazio é o único erro real — categories e paymentMethod inválido viram warnings", () => {
    const r = validate({
      rawText: "",
      categories: [],
      context: { paymentMethod: "INVALIDO" },
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.length >= 1, `Esperado >= 1 erro (rawText), recebido: ${r.errors.length}`);
    assert.ok(r.warnings.length >= 2, `Esperado >= 2 warnings (categories + paymentMethod), recebido: ${r.warnings.length}`);
  });

  it("rawText curto + categories vazio acumula warning e outro warning", () => {
    const r = validate({
      rawText: "curto", // warning (< 10 chars)
      categories: [],   // warning (não mais erro)
      context: { bank: "Nubank", paymentMethod: "PIX" },
    });
    assert.equal(r.valid, true);   // rawText não está vazio, só curto
    assert.equal(r.errors.length, 0);
    assert.ok(r.warnings.length >= 2);
  });

  it("sem rawText bloqueia mesmo que tudo mais esteja ok", () => {
    const r = validate({ rawText: "" });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes("rawText está vazio")));
  });
});
