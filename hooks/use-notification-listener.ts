import { analyzeText } from "@/lib/backend";
import {
    enqueueNotification,
    getPendingAiNotifications,
    isNotificationInQueue,
    updateWithAiResult,
} from "@/lib/notification-queue";
import {
    BANK_APPS,
    inferCategoryFromText,
    parseNotification,
} from "@/lib/notifications/parsers";
import { listCategories } from "@/lib/repositories/categories";
import BankNotifications, {
    type BankNotificationEvent,
} from "@/modules/bank-notifications";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const AI_RETRY_INTERVAL_MS = 30_000;

export function useNotificationListener() {
  const isOnlineRef = useRef(true);
  const aiRetryInProgressRef = useRef(false);

  useEffect(() => {
    if (!BankNotifications) {
      console.log("[AutoImport] Módulo BankNotifications não disponível");
      return;
    }
    console.log("[AutoImport] Listener registrado com sucesso");

    let destroyed = false;

    // ── NetInfo: monitora conectividade em tempo real ──────────────────
    const netInfoSub = NetInfo.addEventListener((state) => {
      const wasOnline = isOnlineRef.current;
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      isOnlineRef.current = isOnline;

      if (isOnline && !wasOnline) {
        console.log("[AutoImport] Internet restaurada — reprocessando notificações pendentes");
        void retryPendingAiEnrichment();
      } else if (!isOnline && wasOnline) {
        console.log("[AutoImport] Sem internet — notificações serão salvas com fallback local");
      }
    });

    // ── Verifica estado inicial de conectividade ────────────────────────
    NetInfo.fetch().then((state) => {
      isOnlineRef.current = state.isConnected === true && state.isInternetReachable !== false;
    });

    // ── Processa notificação bruta: parse local → enfileira no SQLite ──
    async function processNotification(event: BankNotificationEvent) {
      const isBankApp = event.packageName in BANK_APPS;
      console.log(
        `[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`
      );

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

      let categoryId = categories[0].id;
      let categoryName = categories[0].name;
      let description = parsed.description;

      // Tenta IA apenas se online
      if (isOnlineRef.current) {
        try {
          const aiResult = await analyzeText(
            text,
            "TEXT",
            categories.map((c) => ({ id: c.id, name: c.name }))
          );
          const draft = aiResult?.draft;
          if (draft) {
            if (draft.description) description = draft.description;
            if (draft.categoryId) {
              const matched = categories.find((c) => c.id === draft.categoryId);
              if (matched) {
                categoryId = matched.id;
                categoryName = matched.name;
              }
            }
          }

          const added = await enqueueNotification({
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

          if (added) {
            // Marca como enriquecida pela IA
            const items = await getPendingAiNotifications();
            const item = items.find(
              (i) =>
                i.packageName === event.packageName &&
                i.postTime === event.postTime &&
                i.amount === parsed.amount
            );
            if (item) {
              await updateWithAiResult(item.id, {
                description,
                categoryId,
                categoryName,
              });
            }
          }

          console.log(
            `[AutoImport] Enfileirado com IA: ${description} R$${parsed.amount}`
          );
          return;
        } catch (aiErr) {
          console.warn(
            "[AutoImport] IA falhou, usando inferência local:",
            aiErr instanceof Error ? aiErr.message : aiErr
          );
        }
      } else {
        console.log("[AutoImport] Offline — usando inferência local");
      }

      // Fallback local (offline ou IA falhou) — enfileira com ai_enriched=0
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

      await enqueueNotification({
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

      console.log(
        `[AutoImport] Enfileirado (fallback local): ${description} R$${parsed.amount}`
      );
    }

    // ── Reprocesso de notificações que ficaram sem IA (offline) ────────
    async function retryPendingAiEnrichment() {
      if (aiRetryInProgressRef.current) return;
      if (!isOnlineRef.current) return;
      aiRetryInProgressRef.current = true;

      try {
        const pendingItems = await getPendingAiNotifications();
        if (pendingItems.length === 0) return;

        console.log(
          `[AutoImport] Reprocessando ${pendingItems.length} notificações pendentes com IA`
        );

        const categories = await listCategories();
        if (categories.length === 0) return;

        for (const item of pendingItems) {
          if (destroyed || !isOnlineRef.current) break;

          try {
            const aiResult = await analyzeText(
              item.rawText,
              "TEXT",
              categories.map((c) => ({ id: c.id, name: c.name }))
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
              });
              console.log(`[AutoImport] IA reprocessou: ${description}`);
            }
          } catch (err) {
            console.warn(
              `[AutoImport] Falha ao reprocessar ${item.id}:`,
              err instanceof Error ? err.message : err
            );
            break;
          }
        }
      } finally {
        aiRetryInProgressRef.current = false;
      }
    }

    // ── Inscrição nos eventos nativos ──────────────────────────────────
    const notifSub = BankNotifications.addListener(
      "onNotification",
      (event: BankNotificationEvent) => {
        void processNotification(event);
      }
    );

    const connSub = BankNotifications.addListener(
      "onConnectionChange",
      (event: { connected: boolean }) => {
        if (event.connected) {
          console.log("[AutoImport] Listener reconectado");
          void retryPendingAiEnrichment();
        } else {
          console.warn("[AutoImport] Listener desconectado pelo Android — tentando rebind");
          try {
            BankNotifications?.requestRebind();
          } catch (e) {
            console.warn("[AutoImport] requestRebind falhou:", e);
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
          console.warn(
            "[AutoImport] Listener desconectado — tentando rebind automático"
          );
          try {
            BankNotifications?.requestRebind();
          } catch (e) {
            console.warn("[AutoImport] requestRebind falhou:", e);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    // ── Retry periódico de IA (caso NetInfo não dispare) ───────────────
    const aiRetryInterval = setInterval(() => {
      if (isOnlineRef.current) {
        void retryPendingAiEnrichment();
      }
    }, AI_RETRY_INTERVAL_MS);

    // ── Retry inicial (notificações que ficaram pendentes de sessão anterior)
    void retryPendingAiEnrichment();

    return () => {
      destroyed = true;
      netInfoSub();
      notifSub.remove();
      connSub.remove();
      clearInterval(healthCheck);
      clearInterval(aiRetryInterval);
    };
  }, []);
}
