import { analyzeText } from "@/lib/backend";
import { emitNotificationQueued } from "@/lib/notification-events";
import {
  acquireLock,
  cleanupStaleLocks,
  getPendingAiNotifications,
  incrementRetryCount,
  releaseLock,
  updateWithAiResult,
} from "@/lib/notification-queue";
import { isGenericDescription } from "@/lib/notifications/parsers";
import { validateNotificationAiPayload } from "@/lib/notifications/validate-ai-payload";
import { listCategories } from "@/lib/repositories/categories";
import type { Category, PaymentMethod, TransactionType } from "@/lib/types";

const AI_CALL_TIMEOUT_MS = 15_000;
const AI_BATCH_SIZE = 10;

const VALID_TYPES: TransactionType[] = ["INCOME", "EXPENSE"];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER"];
// Categorias de consumo não fazem sentido para receitas (ex.: Pix recebido como "Alimentação")
const EXPENSE_ONLY_CATEGORIES = ["alimentação", "transporte", "lazer", "compras", "moradia", "saúde", "educação", "assinaturas"];

export interface ValidatedAiDraft {
  valid: boolean;
  description: string | null;
  amount: number | null;
  type: TransactionType | null;
  paymentMethod: PaymentMethod | null;
  categoryId: string | null;
  categoryName: string | null;
  warnings: string[];
}

/**
 * Valida a resposta da IA antes de aplicá-la sobre o resultado local.
 * `actualType` é o tipo que vale para o item (do parser ou do usuário); sem
 * ele, usa o tipo que a IA sugeriu para checar a coerência da categoria.
 */
export function validateAiDraft(
  draft: Record<string, unknown>,
  categories: Category[],
  actualType?: TransactionType | null
): ValidatedAiDraft {
  const warnings: string[] = [];

  let description: string | null = null;
  if (typeof draft.description === "string" && draft.description.trim().length > 0) {
    description = draft.description.trim().slice(0, 300);
  } else {
    warnings.push("IA: description ausente ou inválida");
  }

  let amount: number | null = null;
  if (typeof draft.amount === "number" && draft.amount > 0 && draft.amount <= 999_999_999.99) {
    amount = Math.round(draft.amount * 100) / 100;
  } else if (typeof draft.amount === "string") {
    const raw = draft.amount.replace(/[^0-9.,]/g, "");
    // Termina com ,XX → brasileiro (1.234,56); senão → americano (1,234.56)
    const normalized = /,\d{2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 999_999_999.99) amount = Math.round(parsed * 100) / 100;
  }
  if (amount === null) warnings.push("IA: amount ausente ou inválido");

  let type: TransactionType | null = null;
  if (typeof draft.type === "string" && VALID_TYPES.includes(draft.type as TransactionType)) {
    type = draft.type as TransactionType;
  } else {
    warnings.push("IA: type ausente ou inválido");
  }

  const paymentMethod =
    typeof draft.paymentMethod === "string" && VALID_PAYMENT_METHODS.includes(draft.paymentMethod as PaymentMethod)
      ? (draft.paymentMethod as PaymentMethod)
      : null;

  let category: Category | undefined;
  if (typeof draft.categoryId === "string" && draft.categoryId.trim().length > 0) {
    category = categories.find((c) => c.id === draft.categoryId);
  }
  const draftCategoryName = typeof draft.categoryName === "string" ? draft.categoryName.trim() : "";
  if (!category && draftCategoryName.length > 0) {
    category = categories.find((c) => c.name.toLowerCase() === draftCategoryName.toLowerCase());
  }
  if (!category) warnings.push("IA: categoria não encontrada");

  const effectiveType = actualType ?? draft.type;
  if (category && effectiveType === "INCOME" && EXPENSE_ONLY_CATEGORIES.includes(category.name.toLowerCase())) {
    warnings.push(`IA: categoria "${category.name}" incoerente com tipo INCOME — ignorando categoria da IA`);
    category = undefined;
  }

  return {
    valid: description !== null && amount !== null,
    description,
    amount,
    type,
    paymentMethod,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    warnings,
  };
}

let running = false;

/**
 * Enriquece com IA as notificações ainda não enriquecidas (novas, ou que
 * falharam por estar offline). Roda fora do caminho de captura: uma falha ou
 * demora aqui nunca impede uma notificação de ser gravada.
 */
export async function enrichPendingNotifications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await cleanupStaleLocks();
    const pendingItems = await getPendingAiNotifications(AI_BATCH_SIZE);
    if (pendingItems.length === 0) return;

    const categories = await listCategories();
    if (categories.length === 0) return;
    const aiCategories = categories.map((c) => ({ id: c.id, name: c.name }));

    for (const item of pendingItems) {
      if (!(await acquireLock(item.id))) continue;
      try {
        const context = { bank: item.bank ?? undefined, paymentMethod: item.paymentMethod ?? undefined, type: item.type ?? undefined };
        if (!validateNotificationAiPayload(item.rawText, aiCategories, context, "enrichPendingNotifications").valid) {
          await incrementRetryCount(item.id);
          continue;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const aiResult = await Promise.race([
          analyzeText(item.rawText, "TEXT", aiCategories, context),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("IA timeout")), AI_CALL_TIMEOUT_MS);
          }),
        ]).finally(() => clearTimeout(timer));

        const draft = aiResult?.draft;
        if (!draft) {
          await incrementRetryCount(item.id);
          continue;
        }

        const validated = validateAiDraft(draft as Record<string, unknown>, categories, item.type);
        if (validated.warnings.length > 0) {
          console.warn(`[NotificationAI] Validação IA: ${validated.warnings.join(", ")}`);
        }
        if (!validated.valid) {
          await incrementRetryCount(item.id);
          continue;
        }

        // A IA completa, não corrige: valor e tipo ficam como o parser leu (a IA
        // chegava a trocar o valor pelo saldo ou inverter receita/despesa).
        // A descrição só é trocada se a do parser for genérica ("Compra", "Pix enviado"...).
        const keepDescription = !!item.description && !isGenericDescription(item.description);
        const updated = await updateWithAiResult(item.id, {
          description: keepDescription ? item.description! : validated.description ?? item.description ?? "",
          categoryId: validated.categoryId ?? item.categoryId ?? categories[0].id,
          categoryName: validated.categoryName ?? item.categoryName ?? categories[0].name,
          paymentMethod: item.paymentMethod && item.paymentMethod !== "OTHER" ? null : validated.paymentMethod,
        });
        if (updated) emitNotificationQueued();
      } catch (error) {
        console.warn(`[NotificationAI] Falha ao enriquecer ${item.id}:`, error instanceof Error ? error.message : error);
        await incrementRetryCount(item.id);
      } finally {
        await releaseLock(item.id);
      }
    }
  } finally {
    running = false;
  }
}
