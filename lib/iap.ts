// IAP temporariamente desabilitado - react-native-iap removido para build funcionar
// TODO: Reativar quando Google Play Billing estiver configurado no Play Console
// Copiar o conteudo original do commit anterior para reativar

export async function initIAP(): Promise<void> {
  // no-op
}

export function getAvailableSubscriptions(): unknown[] {
  return [];
}

export function startPurchaseListener(
  _onSuccess: () => void,
  _onError: (error: string) => void
): { remove: () => void } {
  return { remove: () => {} };
}

export async function requestProSubscription(): Promise<void> {
  throw new Error("IAP nao disponivel. Configure no Google Play Console.");
}

export async function closeIAP(): Promise<void> {
  // no-op
}
