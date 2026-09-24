import {
  ApiError,
  analyzeText,
  autoSaveTransaction,
  extractFromPhoto,
  extractFromText,
  ocrDocument,
  transcribeAudio,
} from "@/lib/backend";

// auth module uses expo-secure-store — mock it to avoid native dependency
jest.mock("@/lib/auth", () => ({
  authFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

describe("backend AI functions", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchOk(body: unknown) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => body,
    });
  }

  function mockFetchError(status: number, body: unknown) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      json: async () => body,
    });
  }

  // ── transcribeAudio ────────────────────────────────────────────────────────

  describe("transcribeAudio", () => {
    it("returns transcribed text on success", async () => {
      mockFetchOk({ text: "Paguei 150 reais no supermercado" });
      const result = await transcribeAudio("file://audio.webm", "audio/webm");
      expect(result).toBe("Paguei 150 reais no supermercado");
    });

    it("throws ApiError on 500 response", async () => {
      mockFetchError(500, { error: "Internal server error" });
      await expect(transcribeAudio("file://audio.webm", "audio/webm")).rejects.toBeInstanceOf(ApiError);
    });

    it("throws ApiError with correct status 401", async () => {
      mockFetchError(401, { error: "Unauthorized" });
      await expect(transcribeAudio("file://audio.webm", "audio/webm")).rejects.toMatchObject({ status: 401 });
    });

    it("sends request via POST with FormData", async () => {
      mockFetchOk({ text: "ok" });
      await transcribeAudio("file://audio.webm", "audio/webm");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(FormData);
    });
  });

  // ── ocrDocument ────────────────────────────────────────────────────────────

  describe("ocrDocument", () => {
    it("returns text and draft on success", async () => {
      mockFetchOk({ text: "Nota fiscal", draft: { amount: 80 } });
      const result = await ocrDocument("file://doc.pdf", "application/pdf", []);
      expect(result.text).toBe("Nota fiscal");
      expect(result.draft).toEqual({ amount: 80 });
    });

    it("works without categories argument (defaults to [])", async () => {
      mockFetchOk({ text: "recibo" });
      const result = await ocrDocument("file://img.jpg", "image/jpeg");
      expect(result.text).toBe("recibo");
    });

    it("throws ApiError on 422 unsupported format", async () => {
      mockFetchError(422, { error: "Unsupported format" });
      await expect(ocrDocument("file://doc.pdf", "application/pdf")).rejects.toMatchObject({ status: 422 });
    });

    it("sends categories in FormData", async () => {
      mockFetchOk({ text: "ok" });
      const cats = [{ id: "c1", name: "Alimentação" }];
      await ocrDocument("file://img.jpg", "image/jpeg", cats);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.body).toBeInstanceOf(FormData);
    });
  });

  // ── analyzeText ────────────────────────────────────────────────────────────

  describe("analyzeText", () => {
    it("returns parsed data from TEXT source", async () => {
      const mockTransactions = [{ description: "Aluguel", amount: 1200, type: "EXPENSE" }];
      mockFetchOk({ transactions: mockTransactions });
      const result = await analyzeText("Paguei aluguel 1200", "TEXT", []);
      // Resposta sem wrapper "draft" é normalizada para { draft: ... }
      expect(result.draft.transactions).toHaveLength(1);
      expect(result.draft.transactions[0].description).toBe("Aluguel");
    });

    it("sends correct source field for AUDIO", async () => {
      mockFetchOk({ transactions: [] });
      await analyzeText("texto transcrito", "AUDIO", [{ id: "c1", name: "Transporte" }]);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.source).toBe("AUDIO");
      expect(body.categories).toHaveLength(1);
    });

    it("sends correct source field for DOCUMENT", async () => {
      mockFetchOk({ transactions: [] });
      await analyzeText("conteudo do doc", "DOCUMENT", []);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.source).toBe("DOCUMENT");
      expect(body.rawText).toBe("conteudo do doc");
    });

    it("throws ApiError with TOKEN_LIMIT_EXCEEDED code and friendly message", async () => {
      mockFetchError(429, { error: "Limite excedido", code: "TOKEN_LIMIT_EXCEEDED" });
      let caught: ApiError | null = null;
      try {
        await analyzeText("texto", "TEXT", []);
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught?.code).toBe("TOKEN_LIMIT_EXCEEDED");
      expect(caught?.message).toContain("limite mensal");
    });

    it("throws ApiError on 503 service unavailable", async () => {
      mockFetchError(503, { error: "Service unavailable" });
      await expect(analyzeText("texto", "TEXT", [])).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── extractFromPhoto ───────────────────────────────────────────────────────

  describe("extractFromPhoto", () => {
    it("returns raw extraction object on success", async () => {
      const raw = { description: "iFood", amount: 45.9, type: "EXPENSE" };
      mockFetchOk(raw);
      const result = await extractFromPhoto("base64data", "image/jpeg");
      expect(result).toEqual(raw);
    });

    it("throws ApiError on 400 bad request", async () => {
      mockFetchError(400, { error: "Invalid image" });
      await expect(extractFromPhoto("bad", "image/jpeg")).rejects.toMatchObject({ status: 400 });
    });

    it("sends image and mimeType in JSON body", async () => {
      mockFetchOk({});
      await extractFromPhoto("mybase64", "image/png");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.image).toBe("mybase64");
      expect(body.mimeType).toBe("image/png");
    });

    it("uses POST method with Content-Type application/json", async () => {
      mockFetchOk({});
      await extractFromPhoto("b64", "image/jpeg");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.headers?.["Content-Type"]).toBe("application/json");
    });

    it("throws ApiError with details appended to message", async () => {
      mockFetchError(400, { error: "Validation failed", details: "image too large" });
      let caught: ApiError | null = null;
      try {
        await extractFromPhoto("b64", "image/jpeg");
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught?.message).toContain("image too large");
    });
  });

  // ── extractFromText ────────────────────────────────────────────────────────

  describe("extractFromText", () => {
    it("returns raw extraction object on success", async () => {
      const raw = { description: "Salário", amount: 5000, type: "INCOME" };
      mockFetchOk(raw);
      const result = await extractFromText("Recebi salário");
      expect(result).toEqual(raw);
    });

    it("sends text in JSON body", async () => {
      mockFetchOk({});
      await extractFromText("Comprei pão");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.text).toBe("Comprei pão");
    });

    it("throws ApiError on 503 response", async () => {
      mockFetchError(503, { error: "Service unavailable" });
      await expect(extractFromText("test")).rejects.toMatchObject({ status: 503 });
    });

    it("throws ApiError on 429 with TOKEN_LIMIT_EXCEEDED", async () => {
      mockFetchError(429, { code: "TOKEN_LIMIT_EXCEEDED", error: "limit" });
      let caught: ApiError | null = null;
      try {
        await extractFromText("test");
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught?.code).toBe("TOKEN_LIMIT_EXCEEDED");
      expect(caught?.message).toContain("limite mensal");
    });
  });

  // ── autoSaveTransaction ────────────────────────────────────────────────────

  describe("autoSaveTransaction", () => {
    const base = {
      description: "Mercado",
      amount: 200,
      type: "EXPENSE" as const,
      date: "2025-06-15",
    };

    it("returns saved transaction id from backend", async () => {
      mockFetchOk({ id: "tx-1", ...base });
      const result = await autoSaveTransaction(base);
      expect(result.id).toBe("tx-1");
    });

    it("sends description, amount, type and date in body", async () => {
      mockFetchOk({ id: "tx-2" });
      await autoSaveTransaction(base);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.description).toBe("Mercado");
      expect(body.amount).toBe(200);
      expect(body.type).toBe("EXPENSE");
      expect(body.date).toBe("2025-06-15");
    });

    it("sends optional source and paymentMethod when provided", async () => {
      mockFetchOk({ id: "tx-3" });
      await autoSaveTransaction({ ...base, source: "PHOTO", paymentMethod: "PIX" });
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.source).toBe("PHOTO");
      expect(body.paymentMethod).toBe("PIX");
    });

    it("uses POST method", async () => {
      mockFetchOk({ id: "tx-4" });
      await autoSaveTransaction(base);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe("POST");
    });

    it("throws ApiError on 401 unauthenticated", async () => {
      mockFetchError(401, { error: "Unauthorized" });
      await expect(autoSaveTransaction(base)).rejects.toMatchObject({ status: 401 });
    });

    it("throws ApiError on 429 TOKEN_LIMIT_EXCEEDED with friendly message", async () => {
      mockFetchError(429, { code: "TOKEN_LIMIT_EXCEEDED", error: "limit" });
      let caught: ApiError | null = null;
      try {
        await autoSaveTransaction(base);
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught?.code).toBe("TOKEN_LIMIT_EXCEEDED");
      expect(caught?.message).toContain("limite mensal");
    });
  });

  // ── ApiError class ─────────────────────────────────────────────────────────

  describe("ApiError", () => {
    it("carries status and message", () => {
      const err = new ApiError("Not found", 404);
      expect(err.message).toBe("Not found");
      expect(err.status).toBe(404);
      expect(err.code).toBeUndefined();
    });

    it("carries optional code", () => {
      const err = new ApiError("Limit", 429, "TOKEN_LIMIT_EXCEEDED");
      expect(err.code).toBe("TOKEN_LIMIT_EXCEEDED");
    });

    it("is instanceof Error", () => {
      const err = new ApiError("oops", 500);
      expect(err).toBeInstanceOf(Error);
    });

    it("includes details appended to message when present in error response", async () => {
      mockFetchError(400, { error: "Validation failed", details: "amount must be positive" });
      let caught: ApiError | null = null;
      try {
        await extractFromText("test");
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught?.message).toContain("amount must be positive");
    });

    it("falls back to status code in message when body has no error field", async () => {
      mockFetchError(500, {});
      let caught: ApiError | null = null;
      try {
        await extractFromText("test");
      } catch (e) {
        caught = e as ApiError;
      }
      expect(caught?.message).toContain("500");
    });
  });
});
