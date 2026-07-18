import { BANK_APPS } from "@/lib/notifications/parsers";

export const VALID_PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "PIX",
  "BANK_TRANSFER",
  "BOLETO",
  "MERCADO_PAGO",
  "OTHER",
] as const;

export type ValidateOrigin = "processNotification" | "retryPendingAiEnrichment";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida o payload que será enviado à IA para enriquecimento de notificações bancárias.
 * Retorna { valid, errors, warnings } para facilitar testes unitários.
 * Também emite logs para facilitar debug em produção.
 */
export function validateNotificationAiPayload(
  rawText: string,
  categories: Array<{ id: string; name: string }>,
  context: { bank?: string; paymentMethod?: string; type?: string },
  origin: ValidateOrigin
): ValidationResult {
  const tag = `[AutoImport][ValidatePayload][${origin}]`;
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── rawText ───────────────────────────────────────────────────────
  if (!rawText || rawText.trim().length === 0) {
    errors.push("rawText está vazio — a IA não terá texto para processar");
  } else if (rawText.trim().length < 10) {
    warnings.push(
      `rawText muito curto (${rawText.trim().length} chars): "${rawText.trim()}"`
    );
  }

  // ── categories ───────────────────────────────────────────────────
  // O backend aceita categories vazio (default: []) — apenas avisa, não bloqueia.
  if (!categories || categories.length === 0) {
    warnings.push("categories está vazio — IA categorizará sem sugestões");
  } else {
    const invalid = categories.filter((c) => !c.id || !c.name);
    if (invalid.length > 0) {
      warnings.push(`${invalid.length} categoria(s) com id ou name ausente`);
    }
  }

  // ── context.bank ─────────────────────────────────────────────────
  if (!context.bank || context.bank.trim().length === 0) {
    warnings.push("context.bank ausente — IA processará sem contexto de banco");
  } else {
    const knownBanks = Object.values(BANK_APPS);
    if (!knownBanks.includes(context.bank)) {
      warnings.push(
        `context.bank desconhecido: "${context.bank}" (esperado: ${knownBanks.join(", ")})`
      );
    }
  }

  // ── context.paymentMethod ────────────────────────────────────────
  if (!context.paymentMethod || context.paymentMethod.trim().length === 0) {
    warnings.push("context.paymentMethod ausente — IA inferirá sem contexto");
  } else if (
    !VALID_PAYMENT_METHODS.includes(
      context.paymentMethod as (typeof VALID_PAYMENT_METHODS)[number]
    )
  ) {
    // context é opcional no backend — paymentMethod desconhecido vira aviso, não bloqueia.
    warnings.push(
      `context.paymentMethod desconhecido: "${context.paymentMethod}" (válidos: ${VALID_PAYMENT_METHODS.join(", ")})`
    );
  }

  // ── Log ──────────────────────────────────────────────────────────
  const payloadLog = {
    rawText: rawText.length > 120 ? rawText.slice(0, 120) + "…" : rawText,
    source: "TEXT",
    categoriesCount: categories.length,
    categoryNames: categories.map((c) => c.name).join(", "),
    contextBank: context.bank ?? "(ausente)",
    contextPaymentMethod: context.paymentMethod ?? "(ausente)",
    contextType: context.type ?? "(ausente)",
  };

  const valid = errors.length === 0;

  if (!valid) {
    console.error(`${tag} PAYLOAD INVÁLIDO — chamada à IA será abortada`, payloadLog);
    errors.forEach((e) => console.error(`${tag} ✗ ${e}`));
  } else if (warnings.length > 0) {
    console.warn(`${tag} Payload com avisos`, payloadLog);
    warnings.forEach((w) => console.warn(`${tag} ⚠ ${w}`));
  } else {
    console.log(`${tag} Payload OK`, payloadLog);
  }

  return { valid, errors, warnings };
}
