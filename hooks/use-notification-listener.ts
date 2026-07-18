import { analyzeText } from "@/lib/backend";
import { emitNotificationQueued } from "@/lib/notification-events";
import {
    acquireLock,
    cleanupOldQueueItems,
    cleanupStaleLocks,
    enqueueNotification,
    getPendingAiNotifications,
    incrementRetryCount,
    isNotificationInQueue,
    releaseLock,
    updateWithAiResult,
} from "@/lib/notification-queue";
import {
    BANK_APPS,
    inferCategoryFromText,
    parseNotification,
} from "@/lib/notifications/parsers";

// ── Validação do payload enviado à IA (notificações) ──────────────────
const VALID_PAYMENT_METHODS = [
  "CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX",
  "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER",
] as const;

function validateNotificationAiPayload(
  rawText: string,
  categories: Array<{ id: string; name: string }>,
  context: { bank?: string; paymentMethod?: string },
  origin: "processNotification" | "retryPendingAiEnrichment"
): boolean {
  const tag = `[AutoImport][ValidatePayload][${origin}]`;
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── rawText ───────────────────────────────────────────────────────
  if (!rawText || rawText.trim().length === 0) {
    errors.push("rawText está vazio — a IA não terá texto para processar");
  } else if (rawText.trim().length < 10) {
    warnings.push(`rawText muito curto (${rawText.trim().length} chars): "${rawText.trim()}"`);
  }

  // ── categories ───────────────────────────────────────────────────
  if (!categories || categories.length === 0) {
    errors.push("categories está vazio — a IA não conseguirá categorizar");
  } else {
    const invalid = categories.filter((c) => !c.id || !c.name);
    if (invalid.length > 0) {
      errors.push(`${invalid.length} categoria(s) com id ou name ausente`);
    }
  }

  // ── context.bank ─────────────────────────────────────────────────
  if (!context.bank || context.bank.trim().length === 0) {
    warnings.push("context.bank ausente — IA processará sem contexto de banco");
  } else {
    const knownBanks = Object.values(BANK_APPS);
    if (!knownBanks.includes(context.bank)) {
      warnings.push(`context.bank desconhecido: "${context.bank}" (esperado: ${knownBanks.join(", ")})`);
    }
  }

  // ── context.paymentMethod ────────────────────────────────────────
  if (!context.paymentMethod || context.paymentMethod.trim().length === 0) {
    warnings.push("context.paymentMethod ausente — IA inferirá sem contexto");
  } else if (!VALID_PAYMENT_METHODS.includes(context.paymentMethod as typeof VALID_PAYMENT_METHODS[number])) {
    errors.push(`context.paymentMethod inválido: "${context.paymentMethod}" (válidos: ${VALID_PAYMENT_METHODS.join(", ")})`);
  }

  // ── Log ──────────────────────────────────────────────────────────
  const payloadLog = {
    rawText: rawText.length > 120 ? rawText.slice(0, 120) + "…" : rawText,
    source: "TEXT",
    categoriesCount: categories.length,
    categoryNames: categories.map((c) => c.name).join(", "),
    contextBank: context.bank ?? "(ausente)",
    contextPaymentMethod: context.paymentMethod ?? "(ausente)",
  };

  if (errors.length > 0) {
    console.error(`${tag} PAYLOAD INVÁLIDO — chamada à IA será abortada`, payloadLog);
    errors.forEach((e) => console.error(`${tag} ✗ ${e}`));
    return false;
  }

  if (warnings.length > 0) {
    console.warn(`${tag} Payload com avisos`, payloadLog);
    warnings.forEach((w) => console.warn(`${tag} ⚠ ${w}`));
  } else {
    console.log(`${tag} Payload OK`, payloadLog);
  }

  return true;
}
import { listCategories } from "@/lib/repositories/categories";
import { processSyncQueue } from "@/lib/sync-queue";
import type { Category, PaymentMethod, TransactionType } from "@/lib/types";
import BankNotifications, {
    type BankNotificationEvent,
} from "@/modules/bank-notifications";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";

const HEALTH_CHECK_INTERVAL_MS = 15_000;
const AI_RETRY_INTERVAL_MS = 60_000;
const REBIND_BACKOFF_MS = 5_000;
const REBIND_IMMEDIATE_THRESHOLD_MS = 60_000;
const MAX_CONCURRENT_PROCESSING = 1;
const QUEUE_BACKPRESSURE_THRESHOLD = 50;
const SYNC_INTERVAL_MS = 120_000;
const STARTUP_CHECK_DELAYS_MS = [3_000, 7_000, 12_000];
const AI_CALL_TIMEOUT_MS = 15_000;

export function useNotificationListener() {
  const isOnlineRef = useRef(true);
  const aiRetryInProgressRef = useRef(false);
  const processingQueueRef = useRef<BankNotificationEvent[]>([]);
  const isProcessingRef = useRef(false);
  const lastRebindRef = useRef(0);
  const lastDisconnectRef = useRef(0);
  const dbBusyRef = useRef(false);

  useEffect(() => {
    if (!BankNotifications) {
      console.log("[AutoImport] Módulo BankNotifications não disponível");
      return;
    }
    console.log("[AutoImport] Listener registrado com sucesso");

    function runDbExclusive(fn: () => Promise<void>): void {
      if (dbBusyRef.current) return;
      dbBusyRef.current = true;
      void fn().finally(() => { dbBusyRef.current = false; });
    }

    // ── NetInfo: monitora conectividade em tempo real ──────────────────
    const netInfoSub = NetInfo.addEventListener((state) => {
      const wasOnline = isOnlineRef.current;
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      isOnlineRef.current = isOnline;

      if (isOnline && !wasOnline) {
        console.log("[AutoImport] Internet restaurada — reprocessando notificações pendentes");
        void retryPendingAiEnrichment();
        runDbExclusive(() => processSyncQueue());
      } else if (!isOnline && wasOnline) {
        console.log("[AutoImport] Sem internet — notificações serão salvas com fallback local");
      }
    });

    // ── Verifica estado inicial de conectividade ────────────────────────
    NetInfo.fetch().then((state) => {
      isOnlineRef.current = state.isConnected === true && state.isInternetReachable !== false;
    });

    // ── Validação de dados parseados localmente ──────────────────────
    function validateParsedData(parsed: { amount: number; description: string; type: string; paymentMethod: string; bank: string }): string[] {
      const warnings: string[] = [];
      if (!parsed.amount || parsed.amount <= 0) warnings.push("amount inválido");
      if (!parsed.description || parsed.description.trim().length === 0) warnings.push("description vazia");
      if (parsed.type !== "INCOME" && parsed.type !== "EXPENSE") warnings.push("type inválido");
      const validPaymentMethods = ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER"];
      if (!validPaymentMethods.includes(parsed.paymentMethod)) warnings.push("paymentMethod inválido");
      return warnings;
    }

    // ── Validação da resposta da IA antes de aplicar ──────────────────
    function validateAiDraft(draft: Record<string, unknown>, categories: Category[]): {
      valid: boolean;
      description: string | null;
      amount: number | null;
      type: TransactionType | null;
      paymentMethod: PaymentMethod | null;
      categoryId: string | null;
      categoryName: string | null;
      warnings: string[];
    } {
      const warnings: string[] = [];
      const validTypes: TransactionType[] = ["INCOME", "EXPENSE"];
      const validPaymentMethods: PaymentMethod[] = ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER"];

      // Description
      let aiDescription: string | null = null;
      if (typeof draft.description === "string" && draft.description.trim().length > 0) {
        aiDescription = draft.description.trim().slice(0, 300);
      } else {
        warnings.push("IA: description ausente ou inválida");
      }

      // Amount
      let aiAmount: number | null = null;
      if (typeof draft.amount === "number" && draft.amount > 0 && draft.amount <= 999_999_999.99) {
        aiAmount = Math.round(draft.amount * 100) / 100;
      } else if (typeof draft.amount === "string") {
        const parsed = parseFloat(draft.amount.replace(/[^0-9.,]/g, "").replace(".", "").replace(",", "."));
        if (!isNaN(parsed) && parsed > 0 && parsed <= 999_999_999.99) {
          aiAmount = Math.round(parsed * 100) / 100;
        }
      }
      if (aiAmount === null) warnings.push("IA: amount ausente ou inválido");

      // Type
      let aiType: TransactionType | null = null;
      if (typeof draft.type === "string" && validTypes.includes(draft.type as TransactionType)) {
        aiType = draft.type as TransactionType;
      } else {
        warnings.push("IA: type ausente ou inválido");
      }

      // PaymentMethod
      let aiPaymentMethod: PaymentMethod | null = null;
      if (typeof draft.paymentMethod === "string" && validPaymentMethods.includes(draft.paymentMethod as PaymentMethod)) {
        aiPaymentMethod = draft.paymentMethod as PaymentMethod;
      }

      // Category
      let aiCategoryId: string | null = null;
      let aiCategoryName: string | null = null;
      if (typeof draft.categoryId === "string" && draft.categoryId.trim().length > 0) {
        const catMatch = categories.find((c) => c.id === draft.categoryId);
        if (catMatch) {
          aiCategoryId = catMatch.id;
          aiCategoryName = catMatch.name;
        }
      }
      if (!aiCategoryId && typeof draft.categoryName === "string" && draft.categoryName.trim().length > 0) {
        const catMatch = categories.find((c) => c.name.toLowerCase() === draft.categoryName!.toLowerCase());
        if (catMatch) {
          aiCategoryId = catMatch.id;
          aiCategoryName = catMatch.name;
        }
      }
      if (!aiCategoryId) warnings.push("IA: categoria não encontrada");

      // Pelo menos description e amount devem ser válidos para considerar a resposta útil
      const valid = aiDescription !== null && aiAmount !== null;

      return { valid, description: aiDescription, amount: aiAmount, type: aiType, paymentMethod: aiPaymentMethod, categoryId: aiCategoryId, categoryName: aiCategoryName, warnings };
    }

    // ── Processa notificação bruta: parse → valida → SQLite → backend → valida resposta ──
    async function processNotification(event: BankNotificationEvent) {
      const isBankApp = event.packageName in BANK_APPS;
      console.log(
        `[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`
      );

      try {
        // ── Etapa 1: Parse local ──────────────────────────────────────
        const parsed = parseNotification(event);
        if (!parsed) {
          console.log("[AutoImport] Não classificada:", event.packageName, event.title);
          return;
        }

        // ── Etapa 2: Validar dados parseados ──────────────────────────
        const parseWarnings = validateParsedData(parsed);
        if (parseWarnings.length > 0) {
          console.warn(`[AutoImport] Validação local: ${parseWarnings.join(", ")}`);
        }
        if (parsed.amount <= 0) {
          console.log("[AutoImport] Amount <= 0 — descartando notificação");
          return;
        }

        const text = [event.title, event.text, event.bigText]
          .filter(Boolean)
          .join(" ");

        // ── Etapa 3: Dedup ────────────────────────────────────────────
        const alreadyInQueue = await isNotificationInQueue(
          event.packageName,
          event.title,
          text,
          parsed.amount,
          event.postTime
        );
        if (alreadyInQueue) {
          console.log("[AutoImport] Notificação já está na fila — ignorando");
          return;
        }

        // ── Etapa 4: Carregar categorias ──────────────────────────────
        const categories = await listCategories();
        if (categories.length === 0) {
          console.warn("[AutoImport] Sem categorias — não é possível processar");
          return;
        }

        // ── Etapa 5: Fallback local (inferência por keywords) ─────────
        let categoryId = categories[0].id;
        let categoryName = categories[0].name;
        let description = parsed.description || "Transação";
        const inferredCatName = inferCategoryFromText(text);
        const matched = inferredCatName
          ? categories.find(
              (c) => c.name.toLowerCase() === inferredCatName.toLowerCase()
            )
          : null;
        if (matched) {
          categoryId = matched.id;
          categoryName = matched.name;
        }

        // ── Etapa 6: Salvar no SQLite com dados do fallback (ai_enriched=0) ──
        const insertedId = await enqueueNotification({
          packageName: event.packageName,
          title: event.title,
          text,
          bigText: event.bigText,
          subText: event.subText,
          postTime: event.postTime,
          rawText: text,
          amount: parsed.amount,
          description,
          type: parsed.type,
          paymentMethod: parsed.paymentMethod,
          bank: parsed.bank,
          categoryId,
          categoryName,
        });

        if (!insertedId) {
          console.log("[AutoImport] Dedup no SQLite — notificação já existente");
          return;
        }

        // Notifica a aba de importação para atualizar em tempo real
        emitNotificationQueued();

        console.log(
          `[AutoImport] Salvo no SQLite (fallback): ${description} R${parsed.amount} [${parsed.type}] cat=${categoryName}`
        );

        // ── Etapa 7: Enriquecimento com IA (backend) ──────────────────
        const shouldSkipAi = processingQueueRef.current.length > QUEUE_BACKPRESSURE_THRESHOLD;

        if (!isOnlineRef.current) {
          console.log("[AutoImport] Offline — salvo com fallback local, será reprocessado");
          return;
        }
        if (shouldSkipAi) {
          console.log("[AutoImport] Backpressure — IA pulada, fallback local salvo");
          return;
        }

        try {
          const aiCategories = categories.map((c) => ({ id: c.id, name: c.name }));
          const aiContext = { bank: parsed.bank, paymentMethod: parsed.paymentMethod };
          const payloadOk = validateNotificationAiPayload(text, aiCategories, aiContext, "processNotification");
          if (!payloadOk) return;

          const aiResult = await Promise.race([
            analyzeText(text, "TEXT", aiCategories, aiContext),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("IA timeout")), AI_CALL_TIMEOUT_MS)
            ),
          ]);

          // ── Etapa 8: Validar resposta da IA ─────────────────────────
          const draft = aiResult?.draft;
          if (!draft) {
            console.warn("[AutoImport] IA retornou sem draft — mantendo fallback local");
            return;
          }

          const validated = validateAiDraft(draft as Record<string, unknown>, categories);
          if (validated.warnings.length > 0) {
            console.warn(`[AutoImport] Validação IA: ${validated.warnings.join(", ")}`);
          }

          if (!validated.valid) {
            console.warn("[AutoImport] Resposta da IA inválida — mantendo fallback local");
            return;
          }

          // ── Etapa 9: Mesclar IA com fallback (IA prevalece, fallback cobre nulos) ──
          const finalDescription = validated.description ?? description;
          const finalCategoryId = validated.categoryId ?? categoryId;
          const finalCategoryName = validated.categoryName ?? categoryName;
          const finalAmount = validated.amount ?? parsed.amount;
          const finalType = validated.type ?? parsed.type;
          const finalPaymentMethod = validated.paymentMethod ?? parsed.paymentMethod;

          // ── Etapa 10: Atualizar SQLite com dados validados da IA ─────
          await updateWithAiResult(insertedId, {
            description: finalDescription,
            categoryId: finalCategoryId,
            categoryName: finalCategoryName,
            amount: finalAmount,
            type: finalType,
            paymentMethod: finalPaymentMethod,
          });

          console.log(
            `[AutoImport] Enriquecido com IA: ${finalDescription} R$${finalAmount} [${finalType}] cat=${finalCategoryName}`
          );
        } catch (aiErr) {
          console.warn(
            "[AutoImport] IA falhou, fallback local já persistido:",
            aiErr instanceof Error ? aiErr.message : aiErr
          );
        }
      } catch (err) {
        console.error(
          "[AutoImport] Erro ao processar notificação:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // ── Fila de processamento: processa uma notificação por vez ────────
    async function drainQueue() {
      if (isProcessingRef.current) return;
      if (dbBusyRef.current) {
        setTimeout(() => void drainQueue(), 100);
        return;
      }
      isProcessingRef.current = true;
      dbBusyRef.current = true;
      try {
        while (processingQueueRef.current.length > 0) {
          const event = processingQueueRef.current.shift();
          if (!event) continue;
          await processNotification(event);
        }
      } finally {
        isProcessingRef.current = false;
        dbBusyRef.current = false;
      }
    }

    // ── Reprocesso de notificações que ficaram sem IA (offline) ────────
    async function retryPendingAiEnrichment() {
      if (aiRetryInProgressRef.current) return;
      if (dbBusyRef.current) return;
      if (!isOnlineRef.current) return;
      aiRetryInProgressRef.current = true;
      dbBusyRef.current = true;

      try {
        await cleanupStaleLocks();
        const pendingItems = await getPendingAiNotifications(10);
        if (pendingItems.length === 0) return;

        console.log(
          `[AutoImport] Reprocessando ${pendingItems.length} notificações pendentes com IA`
        );

        const categories = await listCategories();
        if (categories.length === 0) return;

        for (const item of pendingItems) {
          if (!isOnlineRef.current) break;

          const locked = await acquireLock(item.id);
          if (!locked) continue;

          try {
            const retryCategories = categories.map((c) => ({ id: c.id, name: c.name }));
            const retryContext = { bank: item.bank ?? undefined, paymentMethod: item.paymentMethod ?? undefined };
            const retryPayloadOk = validateNotificationAiPayload(item.rawText, retryCategories, retryContext, "retryPendingAiEnrichment");
            if (!retryPayloadOk) {
              await incrementRetryCount(item.id);
              continue;
            }

            const aiResult = await Promise.race([
              analyzeText(item.rawText, "TEXT", retryCategories, retryContext),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("IA timeout")), AI_CALL_TIMEOUT_MS)
              ),
            ]);
            const draft = aiResult?.draft;
            if (draft) {
              let description = item.description || "";
              let categoryId = item.categoryId || categories[0].id;
              let categoryName = item.categoryName || categories[0].name;

              if (draft.description) description = draft.description;
              if (draft.categoryId) {
                const matched = categories.find((c) => c.id === draft.categoryId);
                if (matched) {
                  categoryId = matched.id;
                  categoryName = matched.name;
                }
              }

              await updateWithAiResult(item.id, {
                description,
                categoryId,
                categoryName,
                amount: draft.amount ?? undefined,
                type: (draft.type as TransactionType) ?? undefined,
                paymentMethod: (draft.paymentMethod as PaymentMethod) ?? undefined,
              });
              console.log(`[AutoImport] IA reprocessou: ${description}`);
            } else {
              await incrementRetryCount(item.id);
            }
          } catch (err) {
            console.warn(
              `[AutoImport] Falha ao reprocessar ${item.id}:`,
              err instanceof Error ? err.message : err
            );
            await incrementRetryCount(item.id);
            continue;
          } finally {
            await releaseLock(item.id);
          }
        }
      } finally {
        aiRetryInProgressRef.current = false;
        dbBusyRef.current = false;
      }
    }

    // ── Inscrição nos eventos nativos ──────────────────────────────────
    const notifSub = BankNotifications.addListener(
      "onNotification",
      (event: BankNotificationEvent) => {
        processingQueueRef.current.push(event);
        void drainQueue();
      }
    );

    const connSub = BankNotifications.addListener(
      "onConnectionChange",
      (event: { connected: boolean }) => {
        if (event.connected) {
          console.log("[AutoImport] Listener reconectado");
          lastRebindRef.current = 0;
          void retryPendingAiEnrichment();
        } else {
          // JS is sole coordinator of rebind (Kotlin no longer auto-rebinds)
          const now = Date.now();
          const prevDisconnect = lastDisconnectRef.current;
          lastDisconnectRef.current = now;
          const isImmediate = now - prevDisconnect < REBIND_IMMEDIATE_THRESHOLD_MS;
          if (isImmediate || now - lastRebindRef.current >= REBIND_BACKOFF_MS) {
            lastRebindRef.current = now;
            console.warn("[AutoImport] Listener desconectado — tentando rebind");
            try {
              BankNotifications?.requestRebind();
            } catch (e) {
              console.warn("[AutoImport] requestRebind falhou:", e);
            }
          } else {
            console.warn("[AutoImport] Listener desconectado — aguardando backoff para rebind");
          }
        }
      }
    );

    // ── Health check: progressivo na inicialização, depois fixo ────────
    function runHealthCheck(): void {
      if (!BankNotifications) return;
      const connected = BankNotifications.isListenerConnected();
      const granted = BankNotifications.isPermissionGranted();
      if (!granted) {
        console.warn("[AutoImport] Permissão de notificação revogada");
      } else if (!connected) {
        const now = Date.now();
        if (now - lastRebindRef.current >= REBIND_BACKOFF_MS) {
          lastRebindRef.current = now;
          console.warn(
            "[AutoImport] Listener desconectado — tentando rebind automático"
          );
          try {
            BankNotifications?.requestRebind();
          } catch (e) {
            console.warn("[AutoImport] requestRebind falhou:", e);
          }
        }
      } else {
        // Listener is connected — drain any pending AI enrichments
        void retryPendingAiEnrichment();
      }
    }

    // Checks agressivos na inicialização (3s, 7s, 12s) para estabilizar rápido
    const startupTimers: ReturnType<typeof setTimeout>[] = [];
    for (const delay of STARTUP_CHECK_DELAYS_MS) {
      startupTimers.push(setTimeout(runHealthCheck, delay));
    }

    // Health check fixo após os checks de inicialização
    const healthCheck = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);

    // ── Retry periódico de IA (caso NetInfo não dispare) ───────────────
    const aiRetryInterval = setInterval(() => {
      if (isOnlineRef.current) {
        void retryPendingAiEnrichment();
      }
    }, AI_RETRY_INTERVAL_MS);

    // ── Sync queue: processa itens pendentes de sync com backend ──────
    const syncInterval = setInterval(() => {
      if (isOnlineRef.current) {
        runDbExclusive(() => processSyncQueue());
      }
    }, SYNC_INTERVAL_MS);

    // ── Startup: check imediato de conexão + limpeza + reprocessamento ──
    if (BankNotifications) {
      const granted = BankNotifications.isPermissionGranted();
      const connected = BankNotifications.isListenerConnected();
      if (granted && !connected) {
        console.warn("[AutoImport] Listener não conectado na inicialização — rebind imediato");
        lastRebindRef.current = Date.now();
        try {
          BankNotifications.requestRebind();
        } catch (e) {
          console.warn("[AutoImport] requestRebind inicial falhou:", e);
        }
      }
    }
    runDbExclusive(() => cleanupOldQueueItems());
    void retryPendingAiEnrichment();
    runDbExclusive(() => processSyncQueue());

    return () => {
      netInfoSub();
      notifSub.remove();
      connSub.remove();
      startupTimers.forEach(clearTimeout);
      clearInterval(healthCheck);
      clearInterval(aiRetryInterval);
      clearInterval(syncInterval);
    };
  }, []);
}
