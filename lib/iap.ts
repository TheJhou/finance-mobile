import { Platform } from "react-native";
import * as RNIap from "react-native-iap";

const PRO_PRODUCT_ID = "finance_pro_monthly";

let initialized = false;
let purchaseListener: { remove: () => void } | null = null;

export async function initIAP(): Promise<void> {
  if (initialized) return;
  if (Platform.OS !== "android") return;

  try {
    await RNIap.initConnection();
    initialized = true;
    console.log("[IAP] Connection initialized");
  } catch (err) {
    console.warn("[IAP] Failed to init connection:", err);
  }
}

export async function closeIAP(): Promise<void> {
  if (!initialized) return;
  try {
    if (purchaseListener) {
      purchaseListener.remove();
      purchaseListener = null;
    }
    await RNIap.endConnection();
    initialized = false;
    console.log("[IAP] Connection closed");
  } catch (err) {
    console.warn("[IAP] Failed to close connection:", err);
  }
}

export function getAvailableSubscriptions(): RNIap.SubscriptionSkus[] {
  return [];
}

export function startPurchaseListener(
  onSuccess: (purchase: RNIap.SubscriptionPurchase) => void,
  onError: (error: string) => void
): { remove: () => void } {
  if (Platform.OS !== "android") {
    return { remove: () => {} };
  }

  purchaseListener = RNIap.purchaseUpdatedListener((purchase) => {
    console.log("[IAP] Purchase updated:", purchase);
    onSuccess(purchase as RNIap.SubscriptionPurchase);
  });

  const errorListener = RNIap.purchaseErrorListener((error) => {
    console.warn("[IAP] Purchase error:", error);
    onError(error.message || "Erro na compra");
  });

  return {
    remove: () => {
      purchaseListener?.remove();
      errorListener.remove();
      purchaseListener = null;
    },
  };
}

export async function requestProSubscription(): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("Assinaturas disponíveis apenas no Android via Google Play.");
  }

  await initIAP();

  try {
    const subscriptions = await RNIap.getSubscriptions({ skus: [PRO_PRODUCT_ID] });
    if (subscriptions.length === 0) {
      throw new Error("Produto de assinatura não encontrado na Google Play Store.");
    }

    await RNIap.requestSubscription({ sku: PRO_PRODUCT_ID });
  } catch (err) {
    console.error("[IAP] requestProSubscription error:", err);
    throw err instanceof Error ? err : new Error("Erro ao iniciar compra");
  }
}

export async function getActivePurchases(): Promise<RNIap.SubscriptionPurchase[]> {
  if (Platform.OS !== "android" || !initialized) return [];
  try {
    return await RNIap.getAvailablePurchases();
  } catch {
    return [];
  }
}
