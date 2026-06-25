import { analyzeText } from "@/lib/backend";
import { generateId, isNotificationProcessed, markNotificationAsProcessed } from "@/lib/db";
import {
    BANK_APPS,
    inferCategoryFromText,
    parseNotification,
} from "@/lib/notifications/parsers";
import { addPendingNotification } from "@/lib/pending-notifications";
import { listCategories } from "@/lib/repositories/categories";
import BankNotifications, {
    type BankNotificationEvent,
} from "@/modules/bank-notifications";
import { useEffect, useRef } from "react";

const HEALTH_CHECK_INTERVAL_MS = 60_000;

export function useNotificationListener() {
  const queueRef = useRef<BankNotificationEvent[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!BankNotifications) {
      console.log("[AutoImport] Módulo BankNotifications não disponível");
      return;
    }
    console.log("[AutoImport] Listener registrado com sucesso");

    let destroyed = false;

    async function processQueue() {
      if (processingRef.current) return;
      processingRef.current = true;

      while (queueRef.current.length > 0 && !destroyed) {
        const event = queueRef.current.shift()!;
        try {
          await processNotification(event);
        } catch (err) {
          console.warn("[AutoImport] Erro ao processar notificação:", err);
        }
      }

      processingRef.current = false;
    }

    async function processNotification(event: BankNotificationEvent) {
      const isBankApp = event.packageName in BANK_APPS;
      console.log(`[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`);

      const parsed = parseNotification(event);
      if (!parsed) {
        console.log("[AutoImport] Não classificada:", event.packageName, event.title);
        return;
      }

      const text = [event.title, event.text, event.bigText]
        .filter(Boolean)
        .join(" ");

      const alreadyProcessed = await isNotificationProcessed(
        event.packageName,
        event.title,
        text,
        parsed.amount,
        event.postTime
      );

      if (alreadyProcessed) return;

      const categories = await listCategories();
      if (categories.length === 0) return;

      let categoryId = categories[0].id;
      let categoryName = categories[0].name;
      let description = parsed.description;

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
      } catch (aiErr) {
        console.warn("[AutoImport] IA indisponível, usando inferência local:", aiErr instanceof Error ? aiErr.message : aiErr);
        const inferredCatName = inferCategoryFromText(text);
        const matched = inferredCatName
          ? categories.find((c) => c.name.toLowerCase() === inferredCatName.toLowerCase())
          : null;
        if (matched) {
          categoryId = matched.id;
          categoryName = matched.name;
        }
      }

      await addPendingNotification({
        id: generateId(),
        bank: parsed.bank,
        packageName: event.packageName,
        raw: text,
        postTime: event.postTime,
        createdAt: new Date().toISOString(),
        amount: parsed.amount,
        description,
        type: parsed.type,
        paymentMethod: parsed.paymentMethod,
        categoryId,
        categoryName,
      });

      await markNotificationAsProcessed(
        event.packageName,
        event.title,
        text,
        parsed.amount,
        event.postTime
      );

      console.log(`[AutoImport] Enfileirado para aprovação: ${description} R$${parsed.amount}`);
    }

    const notifSub = BankNotifications.addListener(
      "onNotification",
      (event: BankNotificationEvent) => {
        queueRef.current.push(event);
        void processQueue();
      }
    );

    const connSub = BankNotifications.addListener(
      "onConnectionChange",
      (event: { connected: boolean }) => {
        if (event.connected) {
          console.log("[AutoImport] Listener reconectado");
        } else {
          console.warn("[AutoImport] Listener desconectado pelo Android");
        }
      }
    );

    const healthCheck = setInterval(() => {
      if (BankNotifications) {
        const connected = BankNotifications.isListenerConnected();
        const granted = BankNotifications.isPermissionGranted();
        if (!granted) {
          console.warn("[AutoImport] Permissão de notificação revogada");
        } else if (!connected) {
          console.warn("[AutoImport] Listener desconectado — reinicie o app ou reative nas configurações");
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      destroyed = true;
      notifSub.remove();
      connSub.remove();
      clearInterval(healthCheck);
    };
  }, []);
}
