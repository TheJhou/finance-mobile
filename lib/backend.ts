const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000";

export async function transcribeAudio(fileUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("audio", {
    uri: fileUri,
    type: mimeType,
    name: "audio.webm",
  } as any);

  const response = await fetch(`${BACKEND_URL}/imports/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro ao transcrever áudio");
  }

  const data = await response.json();
  return data.text;
}

export async function ocrDocument(fileUri: string, mimeType: string): Promise<string> {
  const formData = new FormData();
  formData.append("document", {
    uri: fileUri,
    type: mimeType,
    name: "document.pdf",
  } as any);

  const response = await fetch(`${BACKEND_URL}/imports/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro ao processar documento");
  }

  const data = await response.json();
  return data.text;
}

export async function analyzeText(text: string, source: "TEXT" | "DOCUMENT" | "AUDIO", categories: Array<{ id: string; name: string }>) {
  const response = await fetch(`${BACKEND_URL}/imports/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rawText: text,
      source,
      categories,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Erro ao analisar texto");
  }

  return response.json();
}

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
  const response = await fetch(`${BACKEND_URL}/imports/auto-save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(transaction),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Erro ao salvar transação");
  }

  return response.json();
}
