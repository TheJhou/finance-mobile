import { analyzeText } from "@/lib/backend";
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
import { listCategories } from "@/lib/repositories/categories";
import { processSyncQueue } from "@/lib/sync-queue";
import type { PaymentMethod, TransactionType } from "@/lib/types";
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

    // ── Processa notificação bruta: parse → persiste no SQLite → enriquece com IA ──
    async function processNotification(event: BankNotificationEvent) {
      const isBankApp = event.packageName in BANK_APPS;
      console.log(
        `[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`
      );

      try {
        const parsed = parseNotification(event);
        if (!parsed) {
          console.log("[AutoImport] Não classificada:", event.packageName, event.title);
          return;
        }

        const text = [event.title, event.text, event.bigText]
          .filter(Boolean)
          .join(" ");

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

        const categories = await listCategories();
        if (categories.length === 0) return;

        // Fallback local: inferência por keywords
        let categoryId = categories[0].id;
        let categoryName = categories[0].name;
        let description = parsed.description;
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

        // Persiste imediatamente no SQLite com dados do fallback local (ai_enriched=0)
        // Isso garante que a notificação não se perca mesmo se o app for desmontado
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

        if (!insertedId) return;

        // Backpressure: se a fila em memória ainda está grande, pula IA e usa fallback
        const shouldSkipAi = processingQueueRef.current.length > QUEUE_BACKPRESSURE_THRESHOLD;

        // Tenta enriquecimento com IA apenas se online e sem backpressure
        if (isOnlineRef.current && !shouldSkipAi) {
          try {
            const aiResult = await analyzeText(
              text,
              "TEXT",
              categories.map((c) => ({ id: c.id, name: c.name })),
              { bank: parsed.bank, paymentMethod: parsed.paymentMethod }
            );
            const draft = aiResult?.draft;
            if (draft) {
              let aiDescription = description;
              let aiCategoryId = categoryId;
              let aiCategoryName = categoryName;

              if (draft.description) aiDescription = draft.description;
              if (draft.categoryId) {
                const catMatch = categories.find((c) => c.id === draft.categoryId);
                if (catMatch) {
                  aiCategoryId = catMatch.id;
                  aiCategoryName = catMatch.name;
                }
              }

              await updateWithAiResult(insertedId, {
                description: aiDescription,
                categoryId: aiCategoryId,
                categoryName: aiCategoryName,
                amount: draft.amount ?? undefined,
                type: (draft.type as TransactionType) ?? undefined,
                paymentMethod: (draft.paymentMethod as PaymentMethod) ?? undefined,
              });

              console.log(
                `[AutoImport] Enriquecido com IA: ${aiDescription} R$${draft.amount ?? parsed.amount}`
              );
              return;
            }
          } catch (aiErr) {
            console.warn(
              "[AutoImport] IA falhou, fallback local já persistido:",
              aiErr instanceof Error ? aiErr.message : aiErr
            );
          }
        } else if (shouldSkipAi) {
          console.log("[AutoImport] Backpressure — IA pulada, fallback local salvo");
        } else {
          console.log("[AutoImport] Offline — salvo com fallback local, será reprocessado");
        }

        console.log(
          `[AutoImport] Enfileirado (fallback local): ${description} R$${parsed.amount}`
        );
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
            const aiResult = await analyzeText(
              item.rawText,
              "TEXT",
              categories.map((c) => ({ id: c.id, name: c.name })),
              { bank: item.bank ?? undefined, paymentMethod: item.paymentMethod ?? undefined }
            );
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
          const now = Date.now();
          const prevDisconnect = lastDisconnectRef.current;
          lastDisconnectRef.current = now;
          // Frequent disconnects (within 60s of last one): try immediately
          const isImmediate = now - prevDisconnect < REBIND_IMMEDIATE_THRESHOLD_MS;
          if (isImmediate || now - lastRebindRef.current >= REBIND_BACKOFF_MS) {
            lastRebindRef.current = now;
            console.warn("[AutoImport] Listener desconectado — tentando rebind");
            try {
              BankNotifications?.requestRebind();
            } catch (e) {
              console.warn("[AutoImport] requestRebind falhou:", e);
            }
          }
        }
      }
    );

    // ── Health check periódico ─────────────────────────────────────────
    const healthCheck = setInterval(() => {
      if (BankNotifications) {
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
    }, HEALTH_CHECK_INTERVAL_MS);

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

    // ── Startup: limpa notificações antigas e reprocessa pendentes ─────
    runDbExclusive(() => cleanupOldQueueItems());
    void retryPendingAiEnrichment();
    runDbExclusive(() => processSyncQueue());

    return () => {
      netInfoSub();
      notifSub.remove();
      connSub.remove();
      clearInterval(healthCheck);
      clearInterval(aiRetryInterval);
      clearInterval(syncInterval);
    };
  }, []);
}
