import { extractFromPhoto, extractFromText } from "@/lib/backend";

import type { DocumentType } from "@/lib/types";
import { toDateInputValue } from "@/lib/utils";

export interface ExtractedTransaction {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  categoryName: string | null;
  paymentMethod: string | null;
  documentType: DocumentType;
  boletoNumber?: string | null;
  cnpj?: string | null;
  recipientName?: string | null;
}

function normalize(data: Record<string, unknown>, fallbackDesc: string): ExtractedTransaction {
  return {
    description: (data.description as string) ?? fallbackDesc,
    amount: typeof data.amount === "number" ? Math.abs(data.amount) : 0,
    type: typeof data.type === "string" && data.type.toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE",
    date: (data.date as string) ?? toDateInputValue(new Date()),
    categoryName: (data.categoryName as string) ?? null,
    paymentMethod: (data.paymentMethod as string) ?? null,
    documentType: (data.documentType as DocumentType) ?? "NORMAL",
    boletoNumber: (data.boletoNumber as string) ?? null,
    cnpj: (data.cnpj as string) ?? null,
    recipientName: (data.recipientName as string) ?? null,
  };
}

export async function extractTransactionFromPhoto(
  base64Image: string,
  mimeType: string
): Promise<ExtractedTransaction> {
  const raw = await extractFromPhoto(base64Image, mimeType);
  return normalize(raw, "");
}

export async function extractTransactionFromText(
  text: string
): Promise<ExtractedTransaction> {
  const raw = await extractFromText(text);
  return normalize(raw, text.substring(0, 50));
}
