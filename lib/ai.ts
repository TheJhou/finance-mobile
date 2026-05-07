import { extractFromPhoto, extractFromText } from "@/lib/backend";

export interface ExtractedTransaction {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  categoryName: string | null;
}

function normalize(data: Record<string, unknown>, fallbackDesc: string): ExtractedTransaction {
  return {
    description: (data.description as string) ?? fallbackDesc,
    amount: typeof data.amount === "number" ? Math.abs(data.amount) : 0,
    type: typeof data.type === "string" && data.type.toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE",
    date: (data.date as string) ?? new Date().toISOString().slice(0, 10),
    categoryName: (data.categoryName as string) ?? null,
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
