import { isNotificationProcessed, markNotificationAsProcessed } from "@/lib/db";
import {
    BANK_APPS,
    inferCategoryFromText,
    parseNotification,
} from "@/lib/notifications/parsers";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { toDateInputValue } from "@/lib/utils";
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
        // Log ALL notifications for debugging
        const isBankApp = event.packageName in BANK_APPS;
        console.log(`[AutoImport] Notificação recebida: pkg=${event.packageName} bank=${isBankApp} title=${event.title}`);

        // Prevent concurrent processing
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

          if (alreadyProcessed) {
            return;
          }

          // Load categories to infer the best one
          const categories = await listCategories();
          if (categories.length === 0) {
            return;
          }

          const inferredCatName = inferCategoryFromText(text);
          const categoryId = inferredCatName
            ? categories.find(
                (c) => c.name.toLowerCase() === inferredCatName.toLowerCase()
              )?.id ?? categories[0].id
            : categories[0].id;

          await createTransaction({
            description: parsed.description,
            amount: parsed.amount,
            type: parsed.type,
            paymentMethod: parsed.paymentMethod,
            date: toDateInputValue(new Date(event.postTime)),
            categoryId,
            notes: `Auto-importado de ${parsed.bank}`,
            status: "PAID",
          });

          await markNotificationAsProcessed(
            event.packageName,
            event.title,
            text,
            parsed.amount,
            event.postTime
          );

        } catch (err) {
          // Erro silencioso em producao
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
