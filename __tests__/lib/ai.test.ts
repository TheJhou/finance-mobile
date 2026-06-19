import {
  extractTransactionFromPhoto,
  extractTransactionFromText,
} from "@/lib/ai";
import * as backend from "@/lib/backend";

jest.mock("@/lib/backend");

describe("ai extraction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("extractTransactionFromPhoto", () => {
    it("normalizes backend response with all fields", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({
        description: "Mercado Dia",
        amount: 123.45,
        type: "EXPENSE",
        date: "2025-06-15",
        categoryName: "Alimentação",
        paymentMethod: "CREDIT_CARD",
        documentType: "INVOICE",
        boletoNumber: "123",
        cnpj: "12.345.678/0001-00",
        recipientName: "Mercado",
      });

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");

      expect(result.description).toBe("Mercado Dia");
      expect(result.amount).toBe(123.45);
      expect(result.type).toBe("EXPENSE");
      expect(result.date).toBe("2025-06-15");
      expect(result.categoryName).toBe("Alimentação");
      expect(result.paymentMethod).toBe("CREDIT_CARD");
      expect(result.documentType).toBe("INVOICE");
      expect(result.boletoNumber).toBe("123");
      expect(result.cnpj).toBe("12.345.678/0001-00");
      expect(result.recipientName).toBe("Mercado");
    });

    it("uses empty string fallback when description is missing", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({});

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.description).toBe("");
    });

    it("defaults amount to 0 and type to EXPENSE", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({});

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.amount).toBe(0);
      expect(result.type).toBe("EXPENSE");
    });

    it("defaults documentType to NORMAL", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({});

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.documentType).toBe("NORMAL");
    });

    it("returns null for optional fields when missing", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({});

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.categoryName).toBeNull();
      expect(result.paymentMethod).toBeNull();
      expect(result.boletoNumber).toBeNull();
      expect(result.cnpj).toBeNull();
      expect(result.recipientName).toBeNull();
      expect(result.institution).toBeNull();
      expect(result.documentNumber).toBeNull();
      expect(result.pixKey).toBeNull();
      expect(result.fineAmount).toBeNull();
      expect(result.interestAmount).toBeNull();
      expect(result.discountAmount).toBeNull();
      expect(result.notes).toBeNull();
    });

    it("coerces amount to absolute value", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({
        amount: -50,
      });

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.amount).toBe(50);
    });

    it("handles numeric fine/interest/discount amounts", async () => {
      (backend.extractFromPhoto as jest.Mock).mockResolvedValue({
        fineAmount: 10,
        interestAmount: 5,
        discountAmount: 2,
      });

      const result = await extractTransactionFromPhoto("base64", "image/jpeg");
      expect(result.fineAmount).toBe(10);
      expect(result.interestAmount).toBe(5);
      expect(result.discountAmount).toBe(2);
    });
  });

  describe("extractTransactionFromText", () => {
    it("uses text fallback for description", async () => {
      (backend.extractFromText as jest.Mock).mockResolvedValue({});

      const longText = "Pagamento no mercado para compra de mantimentos e itens diversos";
      const result = await extractTransactionFromText(longText);
      expect(result.description).toBe(longText.substring(0, 50));
    });

    it("normalizes backend response with type INCOME", async () => {
      (backend.extractFromText as jest.Mock).mockResolvedValue({
        description: "Salário",
        amount: 5000,
        type: "INCOME",
        date: "2025-06-01",
        categoryName: "Renda",
        paymentMethod: "BANK_TRANSFER",
      });

      const result = await extractTransactionFromText("Salário recebido");
      expect(result.type).toBe("INCOME");
      expect(result.amount).toBe(5000);
      expect(result.date).toBe("2025-06-01");
    });
  });
});
