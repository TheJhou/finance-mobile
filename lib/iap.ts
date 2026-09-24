import { authFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { clearProCache } from "@/lib/subscription";
import { Platform } from "react-native";
import {
    type EventSubscription,
    type Purchase,
    acknowledgePurchaseAndroid,
    endConnection,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    purchaseErrorListener,
    purchaseUpdatedListener,
    requestPurchase
} from "react-native-iap";

const PRO_PRODUCT_ID = "finance_pro_monthly";

let initialized = false;

export async function initIAP(): Promise<void> {
  if (initialized) return;
  if (Platform.OS !== "android") return;

  try {
    await initConnection();
    initialized = true;
    console.log("[IAP] Connection initialized");
  } catch (err) {
    console.warn("[IAP] Failed to init connection:", err);
  }
}

export async function closeIAP(): Promise<void> {
  if (!initialized) return;
  try {
    await endConnection();
    initialized = false;
    console.log("[IAP] Connection closed");
  } catch (err) {
    console.warn("[IAP] Failed to close connection:", err);
  }
}

export function startPurchaseListener(
  onSuccess: (purchase: Purchase) => void,
  onError: (error: string) => void
): EventSubscription {
  const sub = purchaseUpdatedListener((purchase: Purchase) => {
    onSuccess(purchase);
  });

  const errSub = purchaseErrorListener((error) => {
    console.warn("[IAP] Purchase error:", error.message);
    onError(error.message || "Erro na compra");
  });

  return {
    remove: () => {
      sub.remove();
      errSub.remove();
    },
  };
}

export async function requestProSubscription(): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("Assinaturas disponíveis apenas no Android via Google Play.");
  }

  await initIAP();

  try {
    const result = await fetchProducts({ skus: [PRO_PRODUCT_ID], type: "subs" });
    if (!result || (Array.isArray(result) && result.length === 0)) {
      throw new Error("Produto de assinatura não encontrado na Google Play Store.");
    }

    await requestPurchase({
      request: {
        google: {
          skus: [PRO_PRODUCT_ID],
        },
      },
      type: "subs",
    });
  } catch (err) {
    console.error("[IAP] requestProSubscription error:", err);
    throw err instanceof Error ? err : new Error("Erro ao iniciar compra");
  }
}

export async function getActivePurchases(): Promise<Purchase[]> {
  if (Platform.OS !== "android" || !initialized) return [];
  try {
    return await getAvailablePurchases();
  } catch {
    return [];
  }
}

export async function acknowledgePurchaseTransaction(purchase: Purchase): Promise<void> {
  // O backend normalmente já fez o acknowledge ao validar a compra; aqui é
  // redundância. Falha em um passo não pode impedir o outro.
  const token = purchase.purchaseToken ?? "";
  if (token) {
    try {
      await acknowledgePurchaseAndroid(token);
    } catch (err) {
      console.warn("[IAP] acknowledgePurchaseAndroid falhou (provavelmente já confirmada):", err);
    }
  }
  try {
    await finishTransaction({ purchase, isConsumable: false });
    console.log("[IAP] Transaction finished");
  } catch (err) {
    console.warn("[IAP] finishTransaction falhou:", err);
  }
}

// ── Ativação de compras (independente de qual tela está aberta) ────────────

export type PurchaseEvent =
  | { type: "activated" }
  | { type: "pending" }
  | { type: "error"; message: string }
  | { type: "cancelled" };

type PurchaseEventListener = (event: PurchaseEvent) => void;
const purchaseEventListeners = new Set<PurchaseEventListener>();

/** Permite que a tela de Plano mostre o resultado de uma compra processada globalmente. */
export function onPurchaseEvent(listener: PurchaseEventListener): () => void {
  purchaseEventListeners.add(listener);
  return () => { purchaseEventListeners.delete(listener); };
}

function emitPurchaseEvent(event: PurchaseEvent): void {
  purchaseEventListeners.forEach((l) => l(event));
}

/**
 * Valida a compra no backend (que verifica no Google Play e ativa o PRO)
 * e só então finaliza a transação. Compras pendentes (ex.: boleto) ficam
 * para quando o pagamento compensar — o Google reenvia a atualização.
 */
export async function activatePurchase(purchase: Purchase): Promise<PurchaseEvent> {
  if (purchase.productId !== PRO_PRODUCT_ID) {
    return { type: "error", message: "Produto de assinatura desconhecido." };
  }
  if (purchase.purchaseState === "pending") {
    return { type: "pending" };
  }
  if (purchase.purchaseState !== "purchased" || !purchase.purchaseToken) {
    return { type: "error", message: "Compra sem confirmação da Google Play." };
  }

  const response = await authFetch(`${BACKEND_URL}/subscription/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: purchase.productId, purchaseToken: purchase.purchaseToken }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { type: "error", message: err.message || err.error || "Falha ao ativar assinatura" };
  }

  await acknowledgePurchaseTransaction(purchase);
  clearProCache();
  return { type: "activated" };
}

async function handlePurchaseUpdate(purchase: Purchase): Promise<void> {
  try {
    emitPurchaseEvent(await activatePurchase(purchase));
  } catch (err) {
    // Sem rede/sessão: a compra continua sem acknowledge e será
    // reprocessada por syncUnacknowledgedPurchases na próxima abertura.
    emitPurchaseEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Falha ao ativar assinatura",
    });
  }
}

/**
 * Reprocessa compras pagas que não foram finalizadas (app fechado durante a
 * compra, sem internet, pagamento pendente que compensou). Sem acknowledge
 * em até 3 dias o Google reembolsa automaticamente.
 */
export async function syncUnacknowledgedPurchases(): Promise<void> {
  if (Platform.OS !== "android") return;
  await initIAP();
  const purchases = await getActivePurchases();
  const unacknowledged = purchases.filter(
    (p) =>
      p.productId === PRO_PRODUCT_ID &&
      p.purchaseState === "purchased" &&
      (p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid !== true
  );
  for (const purchase of unacknowledged) {
    await handlePurchaseUpdate(purchase);
  }
}

/**
 * Registra o listener de compras para toda a sessão autenticada.
 * Deve ficar montado no layout do app — não em uma tela específica.
 */
export function startGlobalPurchaseHandling(): EventSubscription {
  const sub = startPurchaseListener(
    (purchase) => { void handlePurchaseUpdate(purchase); },
    (message) => {
      const cancelled = /cancel/i.test(message);
      emitPurchaseEvent(cancelled ? { type: "cancelled" } : { type: "error", message });
    }
  );
  void syncUnacknowledgedPurchases().catch((err) =>
    console.warn("[IAP] Falha ao sincronizar compras pendentes:", err)
  );
  return sub;
}
