import { Platform } from "react-native";
import {
    type EventSubscription,
    type Purchase,
    endConnection,
    fetchProducts,
    getAvailablePurchases,
    initConnection,
    purchaseErrorListener,
    purchaseUpdatedListener,
    requestPurchase,
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
    console.log("[IAP] Purchase updated:", purchase.productId);
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
