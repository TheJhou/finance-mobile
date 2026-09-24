/**
 * Ativação de compras fora da tela de Plano: validação no backend,
 * compras pendentes e recuperação de compras não confirmadas.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("react-native-iap", () => ({
  initConnection: jest.fn().mockResolvedValue(undefined),
  endConnection: jest.fn().mockResolvedValue(undefined),
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
  purchaseUpdatedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  purchaseErrorListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  acknowledgePurchaseAndroid: jest.fn().mockResolvedValue(true),
  finishTransaction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth", () => ({
  authFetch: jest.fn(),
}));

import { authFetch } from "@/lib/auth";
import { activatePurchase, onPurchaseEvent, syncUnacknowledgedPurchases, type PurchaseEvent } from "@/lib/iap";
import { acknowledgePurchaseAndroid, finishTransaction, getAvailablePurchases, type Purchase } from "react-native-iap";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;

function purchase(overrides: Partial<Record<string, unknown>> = {}): Purchase {
  return {
    id: "p1",
    productId: "finance_pro_monthly",
    purchaseState: "purchased",
    purchaseToken: "token-123",
    isAcknowledgedAndroid: false,
    isAutoRenewing: true,
    platform: "android",
    quantity: 1,
    store: "google",
    transactionDate: Date.now(),
    ...overrides,
  } as unknown as Purchase;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthFetch.mockReset();
});

describe("activatePurchase", () => {
  it("valida no backend e só então finaliza a transação", async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    const result = await activatePurchase(purchase());

    expect(result).toEqual({ type: "activated" });
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/subscription/purchase"),
      expect.objectContaining({ method: "POST" })
    );
    expect(finishTransaction).toHaveBeenCalled();
  });

  it("finaliza a transação mesmo se o acknowledge local falhar (backend já confirmou)", async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
    (acknowledgePurchaseAndroid as jest.Mock).mockRejectedValueOnce(new Error("already acknowledged"));

    await activatePurchase(purchase());

    expect(finishTransaction).toHaveBeenCalled();
  });

  it("não envia compra pendente (ex.: boleto) ao backend", async () => {
    const result = await activatePurchase(purchase({ purchaseState: "pending" }));

    expect(result).toEqual({ type: "pending" });
    expect(mockAuthFetch).not.toHaveBeenCalled();
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it("não finaliza a transação se o backend recusar", async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Compra inválida ou não paga" }),
    } as Response);

    const result = await activatePurchase(purchase());

    expect(result).toEqual({ type: "error", message: "Compra inválida ou não paga" });
    expect(finishTransaction).not.toHaveBeenCalled();
  });
});

describe("syncUnacknowledgedPurchases", () => {
  it("reprocessa apenas compras pagas ainda não confirmadas", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValueOnce([
      purchase({ purchaseToken: "novo" }),
      purchase({ purchaseToken: "ja-confirmado", isAcknowledgedAndroid: true }),
      purchase({ purchaseToken: "pendente", purchaseState: "pending" }),
    ]);
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const events: PurchaseEvent[] = [];
    const unsubscribe = onPurchaseEvent((e) => events.push(e));

    await syncUnacknowledgedPurchases();
    unsubscribe();

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockAuthFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.purchaseToken).toBe("novo");
    expect(events).toEqual([{ type: "activated" }]);
  });

  it("emite erro sem lançar quando está offline", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValueOnce([purchase()]);
    mockAuthFetch.mockRejectedValueOnce(new Error("Network request failed"));
    const events: PurchaseEvent[] = [];
    const unsubscribe = onPurchaseEvent((e) => events.push(e));

    await expect(syncUnacknowledgedPurchases()).resolves.toBeUndefined();
    unsubscribe();

    expect(events).toEqual([{ type: "error", message: "Network request failed" }]);
    expect(finishTransaction).not.toHaveBeenCalled();
  });
});
