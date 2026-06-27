/**
 * Testes para subscription.ts (commits: 79cc71a, 5d8a80b)
 *
 * - getSubscriptionStatus: retorna PRO ou FREE conforme backend
 * - getSubscriptionStatus: fallback FREE em erro de rede
 * - isProUser: cacheia resultado
 * - clearProCache: limpa cache
 * - checkProFeature: retorna true se PRO, false se FREE
 */

import { ApiError } from "@/lib/backend";
import { clearProCache, checkProFeature, getSubscriptionStatus, isProUser } from "@/lib/subscription";

jest.mock("@/lib/auth", () => ({
  authFetch: jest.fn(),
  getStoredUserName: jest.fn().mockResolvedValue("testuser"),
}));

import { authFetch } from "@/lib/auth";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;

beforeEach(() => {
  jest.clearAllMocks();
  clearProCache();
});

describe("getSubscriptionStatus", () => {
  it("retorna status PRO quando backend responde 200", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "PRO", name: "Finance Pro", tokenLimit: 30000000 },
        usage: { used: 5000, limit: 30000000, remaining: 29995000, period: "2025-06", resetsAt: "2025-07-01T00:00:00.000Z" },
      }),
    } as any);

    const status = await getSubscriptionStatus();
    expect(status.plan.code).toBe("PRO");
    expect(status.usage.used).toBe(5000);
  });

  it("retorna status FREE quando backend responde 200 com FREE", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "FREE", name: "Gratuito", tokenLimit: 100000 },
        usage: { used: 0, limit: 100000, remaining: 100000, period: "2025-06", resetsAt: "2025-07-01T00:00:00.000Z" },
      }),
    } as any);

    const status = await getSubscriptionStatus();
    expect(status.plan.code).toBe("FREE");
  });

  it("lança ApiError quando backend responde não-ok", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    } as any);

    await expect(getSubscriptionStatus()).rejects.toThrow(ApiError);
  });

  it("retorna FREE default em erro de rede", async () => {
    mockAuthFetch.mockRejectedValue(new Error("Network error"));

    const status = await getSubscriptionStatus();
    expect(status.plan.code).toBe("FREE");
    expect(status.usage.used).toBe(0);
    expect(status.usage.remaining).toBeGreaterThan(0);
  });

  it("traduz TOKEN_LIMIT_EXCEEDED para mensagem amigável", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: "Limite excedido", code: "TOKEN_LIMIT_EXCEEDED" }),
    } as any);

    try {
      await getSubscriptionStatus();
      fail("Should have thrown");
    } catch (err) {
      expect(err instanceof ApiError).toBe(true);
      expect((err as ApiError).message).toMatch(/atualize para o plano Pro/i);
    }
  });
});

describe("isProUser", () => {
  it("retorna true quando backend retorna PRO", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "PRO", name: "Pro", tokenLimit: 30000000 },
        usage: { used: 0, limit: 30000000, remaining: 30000000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    const result = await isProUser();
    expect(result).toBe(true);
  });

  it("retorna false quando backend retorna FREE", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "FREE", name: "Free", tokenLimit: 100000 },
        usage: { used: 0, limit: 100000, remaining: 100000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    const result = await isProUser();
    expect(result).toBe(false);
  });

  it("retorna false em erro de rede", async () => {
    mockAuthFetch.mockRejectedValue(new Error("Network"));

    const result = await isProUser();
    expect(result).toBe(false);
  });

  it("cacheia resultado — segunda chamada não faz fetch", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "PRO", name: "Pro", tokenLimit: 30000000 },
        usage: { used: 0, limit: 30000000, remaining: 30000000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    await isProUser();
    await isProUser();

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  it("após clearProCache, faz novo fetch", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "PRO", name: "Pro", tokenLimit: 30000000 },
        usage: { used: 0, limit: 30000000, remaining: 30000000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    await isProUser();
    clearProCache();
    await isProUser();

    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
  });
});

describe("checkProFeature", () => {
  it("retorna true se usuário é PRO", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "PRO", name: "Pro", tokenLimit: 30000000 },
        usage: { used: 0, limit: 30000000, remaining: 30000000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    const result = await checkProFeature("OCR");
    expect(result).toBe(true);
  });

  it("retorna false se usuário é FREE", async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: { code: "FREE", name: "Free", tokenLimit: 100000 },
        usage: { used: 0, limit: 100000, remaining: 100000, period: "2025-06", resetsAt: "2025-07-01" },
      }),
    } as any);

    const result = await checkProFeature("Excel Export");
    expect(result).toBe(false);
  });
});
