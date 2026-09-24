jest.mock("@/lib/auth", () => ({
  authFetch: jest.fn(),
}));

import { authFetch } from "@/lib/auth";
import { clearProCache, isProUser } from "@/lib/subscription";
import { enqueueSync, processSyncQueue } from "@/lib/sync-queue";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  mockAuthFetch.mockReset();
  clearProCache();
});

describe("isProUser", () => {
  it("falha de rede não fica em cache como FREE", async () => {
    mockAuthFetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await isProUser()).toBe(false);

    mockAuthFetch.mockResolvedValueOnce(okJson({ plan: { code: "PRO" }, usage: {} }));
    expect(await isProUser()).toBe(true);
  });

  it("guarda em cache a resposta real do backend", async () => {
    mockAuthFetch.mockResolvedValueOnce(okJson({ plan: { code: "PRO" }, usage: {} }));
    expect(await isProUser()).toBe(true);
    expect(await isProUser()).toBe(true);
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });
});

describe("processSyncQueue", () => {
  it("envia o id local como externalId para o backend não duplicar reenvios", async () => {
    await enqueueSync("tx-local-123", {
      description: "Mercado",
      amount: 50,
      type: "EXPENSE",
      date: "2026-09-24",
      source: "BANK_NOTIFICATION",
    });
    mockAuthFetch.mockResolvedValueOnce(okJson({ success: true }));

    await processSyncQueue();

    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/\/imports\/auto-save$/);
    expect(JSON.parse(init!.body as string)).toMatchObject({ description: "Mercado", externalId: "tx-local-123" });
  });
});
