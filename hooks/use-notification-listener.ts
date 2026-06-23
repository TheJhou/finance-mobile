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

export function useNotificationListener() {
  const processingRef = useRef(false);

  useEffect(() => {
    if (!BankNotifications) {
      console.log("[AutoImport] Módulo BankNotifications não disponível");
      return;
    }
    console.log("[AutoImport] Listener registrado com sucesso");

    const sub = BankNotifications.addListener(
      "onNotification",
      async (event: BankNotificationEvent) => {
        const isBankApp = event.packageName in BANK_APPS;
        console.log(`[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`);

        if (processingRef.current) return;
        processingRef.current = true;

        try {
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

          // Tentar classificar com IA; fallback para inferência local por keywords
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
          } catch {
            // IA indisponível: usar inferência local
            const inferredCatName = inferCategoryFromText(text);
            const matched = inferredCatName
              ? categories.find((c) => c.name.toLowerCase() === inferredCatName.toLowerCase())
              : null;
            if (matched) {
              categoryId = matched.id;
              categoryName = matched.name;
            }
          }

          // Enfileirar como PENDENTE — aguarda aprovação do usuário na aba Importação
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

          // Marcar como processada para não re-enfileirar
          await markNotificationAsProcessed(
            event.packageName,
            event.title,
            text,
            parsed.amount,
            event.postTime
          );

          console.log(`[AutoImport] Enfileirado para aprovação: ${description} R$${parsed.amount}`);

        } catch (err) {
          console.warn("[AutoImport] Erro ao processar notificação:", err);
        } finally {
          processingRef.current = false;
        }
      }
    );

    return () => {
      sub.remove();
    };
  }, []);
}
