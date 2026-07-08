import type { PaymentMethod } from "@/lib/types";

export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(safe);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.includes("T") ? value : value + "T00:00:00") : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

export function toDateInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizePaymentMethod(
  value: unknown,
  fallback: PaymentMethod = "CASH"
): PaymentMethod {
  const allowed: PaymentMethod[] = [
    "CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX",
    "BANK_TRANSFER", "BOLETO", "MERCADO_PAGO", "OTHER",
  ];
  return typeof value === "string" && allowed.includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : fallback;
}

export function parseCurrencyInput(input: string): number {
  let cleaned = input.replace(/[^0-9.,-]/g, "");

  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Formato BR com separador de milhar: "1.234,56" → remove pontos, vírgula vira ponto
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    // Formato BR sem separador de milhar: "39,90" → vírgula vira ponto
    cleaned = cleaned.replace(",", ".");
  }
  // Se só tem ponto (formato US do toString() ou input direto), mantém como está

  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrencyInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Converte para formato BR com vírgula decimal, sem separador de milhar
  // Ex: 39.9 → "39,90", 1234.56 → "1234,56"
  const fixed = value.toFixed(2);
  return fixed.replace(".", ",");
}
