/**
 * Restaurar compra, preço vindo da Google Play e link para gerenciar/cancelar.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("react-native-iap", () => ({
  initConnection: jest.fn().mockResolvedValue(undefined),
  endConnection: jest.fn().mockResolvedValue(undefined),
  fetchProducts: jest.fn(),
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
import { getProProductPrice, openPlayStoreSubscription, restorePurchases } from "@/lib/iap";
import { Linking } from "react-native";
import { fetchProducts, getAvailablePurchases, type Purchase } from "react-native-iap";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;

function purchase(overrides: Partial<Record<string, unknown>> = {}): Purchase {
  return {
    id: "p1",
    productId: "finance_pro_monthly",
    purchaseState: "purchased",
    purchaseToken: "token-123",
    isAcknowledgedAndroid: true,
    isAutoRenewing: true,
    platform: "android",
    quantity: 1,
    store: "google",
    transactionDate: Date.now(),
    ...overrides,
  } as unknown as Purchase;
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("restorePurchases", () => {
  it("revalida no backend a assinatura encontrada na Google Play", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValue([purchase()]);
    mockAuthFetch.mockResolvedValue(jsonResponse(200, { success: true }));

    expect(await restorePurchases()).toEqual({ type: "restored" });
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining("/subscription/purchase"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sem assinatura nesta conta Google", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValue([purchase({ productId: "outro_produto" })]);

    expect(await restorePurchases()).toEqual({ type: "none" });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("repassa a recusa do backend (ex.: compra vinculada a outra conta)", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValue([purchase()]);
    mockAuthFetch.mockResolvedValue(jsonResponse(403, { message: "Este token de compra já está vinculado a outra conta." }));

    expect(await restorePurchases()).toEqual({
      type: "error",
      message: "Este token de compra já está vinculado a outra conta.",
    });
  });

  it("pagamento ainda pendente", async () => {
    (getAvailablePurchases as jest.Mock).mockResolvedValue([purchase({ purchaseState: "pending" })]);

    expect(await restorePurchases()).toEqual({ type: "pending" });
  });

  it("falha ao consultar a Google Play", async () => {
    (getAvailablePurchases as jest.Mock).mockRejectedValue(new Error("Play indisponível"));

    expect(await restorePurchases()).toEqual({ type: "error", message: "Play indisponível" });
  });
});

describe("getProProductPrice", () => {
  it("usa o preço formatado pela Google Play", async () => {
    (fetchProducts as jest.Mock).mockResolvedValue([{ id: "finance_pro_monthly", displayPrice: "R$ 3,49" }]);

    expect(await getProProductPrice()).toBe("R$ 3,49");
  });

  it("devolve null se a loja não responder", async () => {
    (fetchProducts as jest.Mock).mockRejectedValue(new Error("offline"));

    expect(await getProProductPrice()).toBeNull();
  });
});

describe("openPlayStoreSubscription", () => {
  it("abre a assinatura do app na Google Play", async () => {
    await openPlayStoreSubscription();

    const url = (Linking.openURL as jest.Mock).mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/play\.google\.com\/store\/account\/subscriptions\?/);
    expect(url).toContain("sku=finance_pro_monthly");
    expect(url).toContain("package=com.thejhou.kilun");
  });
});
