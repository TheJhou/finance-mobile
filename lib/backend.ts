import { authFetch } from "@/lib/auth";

const BACKEND_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

// ── Helpers ────────────────────────────────────────────────────────────

async function handleError(response: Response, fallback: string): Promise<never> {
  let msg = `${fallback} (${response.status})`;
  try { const error = await response.json(); msg = error.error || error.message || msg; } catch {}
  throw new Error(msg);
}

// ── Audio ──────────────────────────────────────────────────────────────

export async function transcribeAudio(fileUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("audio", {
    uri: fileUri,
    type: mimeType,
    name: "audio.webm",
  } as any);

  const response = await authFetch(`${BACKEND_URL}/imports/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) await handleError(response, "Erro ao transcrever áudio");

  const data = await response.json();
  return data.text;
}

// ── OCR ────────────────────────────────────────────────────────────────

export async function ocrDocument(fileUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("document", {
    uri: fileUri,
    type: mimeType,
    name: "document.pdf",
  } as any);

  const response = await authFetch(`${BACKEND_URL}/imports/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) await handleError(response, "Erro ao processar documento");

  const data = await response.json();
  return data.text;
}

// ── Análise de texto ───────────────────────────────────────────────────

export async function analyzeText(text: string, source: "TEXT" | "DOCUMENT" | "AUDIO", categories: Array<{ id: string; name: string }>) {
  const response = await authFetch(`${BACKEND_URL}/imports/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText: text, source, categories }),
  });

  if (!response.ok) await handleError(response, "Erro ao analisar texto");
  return response.json();
}

// ── Extração de foto (via backend, sem API key no client) ──────────────

export async function extractFromPhoto(base64Image: string, mimeType: string) {
  const response = await authFetch(`${BACKEND_URL}/imports/extract-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, mimeType }),
  });

  if (!response.ok) await handleError(response, "Erro ao processar foto");
  return response.json();
}

// ── Extração de texto livre (via backend, sem API key no client) ───────

export async function extractFromText(text: string) {
  const response = await authFetch(`${BACKEND_URL}/imports/extract-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) await handleError(response, "Erro ao processar texto");
  return response.json();
}

// ── Auto-save ──────────────────────────────────────────────────────────

export async function autoSaveTransaction(transaction: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  paymentMethod?: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER" | "CASH" | "OTHER";
  date: string;
  categoryId?: string;
  notes?: string;
  source?: "TEXT" | "DOCUMENT" | "AUDIO" | "PHOTO" | "VOICE";
}) {
  const response = await authFetch(`${BACKEND_URL}/imports/auto-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });

  if (!response.ok) await handleError(response, "Erro ao salvar transação");
  return response.json();
}
