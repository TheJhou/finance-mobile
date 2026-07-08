import {
    formatCurrency,
    formatCurrencyInput,
    formatDate,
    formatDateLocal,
    normalizePaymentMethod,
    parseCurrencyInput,
    toDateInputValue,
} from "@/lib/utils";

describe("formatCurrency", () => {
  // Intl.NumberFormat inserts a non-breaking space (\u00A0) between the currency symbol and the value
  const nbsp = "\u00A0";

  it("formats a number to Brazilian Real", () => {
    expect(formatCurrency(100)).toBe(`R$${nbsp}100,00`);
    expect(formatCurrency(1234.56)).toBe(`R$${nbsp}1.234,56`);
    expect(formatCurrency(0)).toBe(`R$${nbsp}0,00`);
  });

  it("formats a numeric string", () => {
    expect(formatCurrency("99.90")).toBe(`R$${nbsp}99,90`);
  });

  it("returns R$0,00 for invalid values", () => {
    expect(formatCurrency("abc")).toBe(`R$${nbsp}0,00`);
    expect(formatCurrency(NaN)).toBe(`R$${nbsp}0,00`);
    expect(formatCurrency(Infinity)).toBe(`R$${nbsp}0,00`);
  });
});

describe("formatDate", () => {
  it("formats an ISO date string to Brazilian format", () => {
    expect(formatDate("2025-06-15")).toBe("15/06/2025");
  });

  it("formats a Date object", () => {
    expect(formatDate(new Date(2025, 5, 15))).toBe("15/06/2025");
  });

  it("returns empty string for invalid date", () => {
    expect(formatDate("invalid")).toBe("");
  });
});

describe("toDateInputValue", () => {
  it("returns yyyy-mm-dd from a Date object", () => {
    expect(toDateInputValue(new Date(2025, 5, 15))).toBe("2025-06-15");
    expect(toDateInputValue(new Date(2025, 0, 1))).toBe("2025-01-01");
  });

  it("returns empty string for invalid date", () => {
    expect(toDateInputValue("invalid")).toBe("");
  });
});

describe("formatDateLocal", () => {
  it("returns yyyy-mm-dd without timezone conversion", () => {
    expect(formatDateLocal(new Date(2025, 5, 15))).toBe("2025-06-15");
    expect(formatDateLocal(new Date(2025, 11, 31))).toBe("2025-12-31");
  });
});

describe("normalizePaymentMethod", () => {
  it("returns the value when it is a valid payment method", () => {
    expect(normalizePaymentMethod("PIX")).toBe("PIX");
    expect(normalizePaymentMethod("CREDIT_CARD")).toBe("CREDIT_CARD");
    expect(normalizePaymentMethod("CASH")).toBe("CASH");
  });

  it("returns default fallback for invalid values", () => {
    expect(normalizePaymentMethod("invalid")).toBe("CASH");
    expect(normalizePaymentMethod(123)).toBe("CASH");
    expect(normalizePaymentMethod(null)).toBe("CASH");
    expect(normalizePaymentMethod(undefined)).toBe("CASH");
  });

  it("returns custom fallback when provided", () => {
    expect(normalizePaymentMethod("invalid", "OTHER")).toBe("OTHER");
    expect(normalizePaymentMethod(null, "PIX")).toBe("PIX");
  });
});

describe("parseCurrencyInput", () => {
  it("parses Brazilian currency format", () => {
    expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
    expect(parseCurrencyInput("100")).toBe(100);
    expect(parseCurrencyInput("0,50")).toBe(0.5);
  });

  it("parses US format (dot as decimal separator from toString())", () => {
    expect(parseCurrencyInput("39.9")).toBe(39.9);
    expect(parseCurrencyInput("99.90")).toBe(99.90);
    expect(parseCurrencyInput("1234.56")).toBe(1234.56);
  });

  it("parses Brazilian format without thousand separator", () => {
    expect(parseCurrencyInput("39,90")).toBe(39.90);
    expect(parseCurrencyInput("1234,56")).toBe(1234.56);
  });

  it("ignores non-numeric characters", () => {
    expect(parseCurrencyInput("R$ 1.234,56")).toBe(1234.56);
  });

  it("returns 0 for invalid input", () => {
    expect(parseCurrencyInput("abc")).toBe(0);
  });
});

describe("formatCurrencyInput", () => {
  it("formats a number to BR input format (comma decimal, no thousand separator)", () => {
    expect(formatCurrencyInput(39.9)).toBe("39,90");
    expect(formatCurrencyInput(1234.56)).toBe("1234,56");
    expect(formatCurrencyInput(0)).toBe("0,00");
  });

  it("returns empty string for invalid values", () => {
    expect(formatCurrencyInput(NaN)).toBe("");
    expect(formatCurrencyInput(Infinity)).toBe("");
  });
});
