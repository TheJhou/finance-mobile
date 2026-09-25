import {
  getProProductPrice,
  onPurchaseEvent,
  openPlayStoreSubscription,
  requestProSubscription,
  restorePurchases,
  type PurchaseEvent,
  type RestoreResult,
} from "@/lib/iap";
import { clearProCache, getSubscriptionStatus, refreshSubscriptionStatus } from "@/lib/subscription";
import { resetTokenLimitStatus } from "@/lib/token-limit";
import type { SubscriptionStatus } from "@/lib/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Estado da tela de Assinatura: status no backend, preço na Google Play e as
 * ações (assinar, gerenciar/cancelar na loja, restaurar).
 * Ao voltar da Google Play, revalida a assinatura: é assim que um cancelamento
 * feito lá aparece na hora.
 */
export function useSubscription(onPurchase: (event: PurchaseEvent) => void) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const returningFromStore = useRef(false);
  const onPurchaseRef = useRef(onPurchase);
  onPurchaseRef.current = onPurchase;

  const load = useCallback(async () => {
    clearProCache();
    try {
      setStatus(await getSubscriptionStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a assinatura");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    void getProProductPrice().then(setPrice);
  }, []);

  // Voltou da Google Play: consulta a loja de novo (cancelamento, reativação, pagamento)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !returningFromStore.current) return;
      returningFromStore.current = false;
      setRefreshing(true);
      refreshSubscriptionStatus()
        .then((updated) => {
          setStatus(updated);
          setError(null);
        })
        .catch(() => load())
        .finally(() => setRefreshing(false));
    });
    return () => sub.remove();
  }, [load]);

  // A compra é validada globalmente (lib/iap); aqui só atualiza a tela
  useEffect(
    () =>
      onPurchaseEvent((event) => {
        setPurchasing(false);
        if (event.type === "activated") void load();
        onPurchaseRef.current(event);
      }),
    [load]
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    resetTokenLimitStatus();
    void load();
  }, [load]);

  const subscribe = useCallback(async () => {
    setPurchasing(true);
    try {
      await requestProSubscription();
    } catch (err) {
      setPurchasing(false);
      const message = err instanceof Error ? err.message : "Erro ao iniciar compra";
      if (!/cancel|user/i.test(message)) onPurchaseRef.current({ type: "error", message });
    }
  }, []);

  /** Abre a assinatura na Google Play (gerenciar, cancelar, reativar, pagamento). */
  const openInPlayStore = useCallback(async () => {
    returningFromStore.current = true;
    await openPlayStoreSubscription();
  }, []);

  const restore = useCallback(async (): Promise<RestoreResult> => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.type === "restored") await load();
      return result;
    } finally {
      setRestoring(false);
    }
  }, [load]);

  return { status, loading, refreshing, error, price, purchasing, restoring, refresh, subscribe, openInPlayStore, restore };
}
