/**
 * Testes unitários para:
 * 1. extractFromText — model gpt-4.1-mini, categories passadas, categoryId resolvido
 * 2. analyzeText    — categories passadas ao /analyze, categoryId retornado
 * 3. ocrDocument    — categories passadas ao OCR, categoryId retornado
 */
import { analyzeText, extractFromText, ocrDocument } from "@/lib/backend";

jest.mock("@/lib/auth", () => ({
  authFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

const CATEGORIES = [
  { id: "cat-1", name: "Alimentação" },
  { id: "cat-2", name: "Transporte" },
  { id: "cat-3", name: "Saúde" },
  { id: "cat-4", name: "Salário" },
];

describe("imports — category classification", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  function mockOk(body: unknown) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => body,
    });
  }

  function mockError(status: number, body: unknown) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      json: async () => body,
    });
  }

  // ── extractFromText ───────────────────────────────────────────────────────

  describe("extractFromText", () => {
    it("passes categories to the backend", async () => {
      mockOk({ description: "iFood", amount: 45.9, type: "EXPENSE", categoryName: "Alimentação", categoryId: "cat-1" });

      await extractFromText("paguei 45,90 no iFood", CATEGORIES);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.categories).toEqual(CATEGORIES);
      expect(body.text).toBe("paguei 45,90 no iFood");
    });

    it("returns categoryId resolved by backend", async () => {
      mockOk({ description: "iFood", amount: 45.9, type: "EXPENSE", categoryName: "Alimentação", categoryId: "cat-1" });

      const result = await extractFromText("paguei 45,90 no iFood", CATEGORIES);
      expect(result.categoryId).toBe("cat-1");
      expect(result.categoryName).toBe("Alimentação");
    });

    it("works without categories (empty array default)", async () => {
      mockOk({ description: "Pagamento genérico", amount: 100, type: "EXPENSE", categoryName: null, categoryId: null });

      const result = await extractFromText("paguei 100 reais");
      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.categories).toEqual([]);
      expect(result.categoryId).toBeNull();
    });

    it("returns correct type for salary", async () => {
      mockOk({ description: "Salário", amount: 3000, type: "INCOME", categoryName: "Salário", categoryId: "cat-4" });

      const result = await extractFromText("recebi meu salário de 3000 reais", CATEGORIES);
      expect(result.type).toBe("INCOME");
      expect(result.categoryId).toBe("cat-4");
    });

    it("throws ApiError on 401", async () => {
      mockError(401, { error: "Usuário não autenticado" });

      await expect(extractFromText("qualquer texto", CATEGORIES)).rejects.toMatchObject({
        status: 401,
      });
    });

    it("throws ApiError with TOKEN_LIMIT_EXCEEDED code", async () => {
      mockError(402, { error: "Limite excedido", code: "TOKEN_LIMIT_EXCEEDED" });

      await expect(extractFromText("texto", CATEGORIES)).rejects.toMatchObject({
        code: "TOKEN_LIMIT_EXCEEDED",
      });
    });
  });

  // ── analyzeText ───────────────────────────────────────────────────────────

  describe("analyzeText", () => {
    it("passes categories to /analyze endpoint", async () => {
      mockOk({
        draft: {
          description: "Uber",
          amount: 22.5,
          type: "EXPENSE",
          date: "2025-06-22",
          categoryId: "cat-2",
          status: "PAID",
          paymentMethod: "PIX",
        },
      });

      await analyzeText("paguei 22,50 no uber", "TEXT", CATEGORIES);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.categories).toEqual(CATEGORIES);
      expect(body.rawText).toBe("paguei 22,50 no uber");
      expect(body.source).toBe("TEXT");
    });

    it("returns draft with categoryId matched", async () => {
      mockOk({
        draft: {
          description: "Consulta médica",
          amount: 200,
          type: "EXPENSE",
          categoryId: "cat-3",
          status: "PAID",
          paymentMethod: "OTHER",
          date: "2025-06-22",
        },
      });

      const result = await analyzeText("consulta médica 200 reais", "TEXT", CATEGORIES);
      expect(result.draft.categoryId).toBe("cat-3");
    });

    it("handles AUDIO source", async () => {
      mockOk({
        draft: { description: "Padaria", amount: 15, type: "EXPENSE", categoryId: "cat-1", status: "PAID", paymentMethod: "CASH", date: "2025-06-22" },
      });

      await analyzeText("comprei pão na padaria por 15 reais", "AUDIO", CATEGORIES);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.source).toBe("AUDIO");
    });

    it("handles DOCUMENT source", async () => {
      mockOk({
        draft: { description: "Boleto água", amount: 87.3, type: "EXPENSE", categoryId: null, status: "PAID", paymentMethod: "BOLETO", date: "2025-06-22" },
      });

      await analyzeText("boleto serviço de água R$ 87,30", "DOCUMENT", CATEGORIES);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(call[1].body).source).toBe("DOCUMENT");
    });

    it("returns null categoryId when AI cannot classify", async () => {
      mockOk({
        draft: { description: "Transação desconhecida", amount: 50, type: "EXPENSE", categoryId: null, status: "PAID", paymentMethod: "OTHER", date: "2025-06-22" },
      });

      const result = await analyzeText("xxxxxx", "TEXT", CATEGORIES);
      expect(result.draft.categoryId).toBeNull();
    });

    it("throws ApiError on 500", async () => {
      mockError(500, { error: "Erro interno" });
      await expect(analyzeText("texto", "TEXT", CATEGORIES)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ── ocrDocument ───────────────────────────────────────────────────────────

  describe("ocrDocument", () => {
    it("passes categories via FormData to /ocr", async () => {
      mockOk({
        text: "Processado com Gemini AI",
        draft: { description: "Nota fiscal", amount: 350, type: "EXPENSE", categoryId: "cat-1", status: "PAID", paymentMethod: "OTHER", date: "2025-06-22" },
      });

      await ocrDocument("file://doc.jpg", "image/jpeg", CATEGORIES);

      const call = (global.fetch as jest.Mock).mock.calls[0];
      // FormData não é parseável como JSON — verificar que foi enviado como FormData (body não tem Content-Type header)
      expect(call[0]).toContain("/imports/ocr");
      expect(call[1].method).toBe("POST");
    });

    it("returns draft with categoryId", async () => {
      mockOk({
        text: "Processado com Gemini AI",
        draft: { description: "Nota fiscal farmácia", amount: 89.9, type: "EXPENSE", categoryId: "cat-3", status: "PAID", paymentMethod: "OTHER", date: "2025-06-22" },
      });

      const result = await ocrDocument("file://farmacia.jpg", "image/jpeg", CATEGORIES);
      expect((result.draft as Record<string, unknown>)?.categoryId).toBe("cat-3");
    });

    it("works with empty categories", async () => {
      mockOk({ text: "Processado", draft: { description: "Doc", amount: 100, type: "EXPENSE", categoryId: null, status: "PAID", paymentMethod: "OTHER", date: "2025-06-22" } });

      const result = await ocrDocument("file://doc.pdf", "application/pdf");
      expect((result.draft as Record<string, unknown>)?.categoryId).toBeNull();
    });

    it("throws ApiError on 400", async () => {
      mockError(400, { error: "Tipo de arquivo não suportado" });
      await expect(ocrDocument("file://doc.xyz", "application/xyz")).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── category matching edge cases ──────────────────────────────────────────

  describe("category matching (via extractFromText response)", () => {
    it("handles exact case-insensitive match", async () => {
      mockOk({ description: "Farmácia", amount: 50, type: "EXPENSE", categoryName: "saúde", categoryId: "cat-3" });
      const result = await extractFromText("comprei remédio por 50", CATEGORIES);
      expect(result.categoryId).toBe("cat-3");
    });

    it("handles null categoryName gracefully", async () => {
      mockOk({ description: "Pagamento", amount: 200, type: "EXPENSE", categoryName: null, categoryId: null });
      const result = await extractFromText("pagamento diverso 200", CATEGORIES);
      expect(result.categoryId).toBeNull();
    });

    it("handles category not in list", async () => {
      mockOk({ description: "Viagem", amount: 1500, type: "EXPENSE", categoryName: "Viagem", categoryId: null });
      const result = await extractFromText("passagem aérea 1500", CATEGORIES);
      // categoria "Viagem" não existe na lista — backend retorna null
      expect(result.categoryId).toBeNull();
    });
  });
});
