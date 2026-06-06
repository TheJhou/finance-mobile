import { authFetch } from "@/lib/auth";

const BACKEND_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

// ── Helpers ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handleError(response: Response, fallback: string): Promise<never> {
  let msg = `${fallback} (${response.status})`;
  let code: string | undefined;
  try {
    const error = await response.json();
    msg = error.error || error.message || msg;
    code = error.code;
    if (error.details) msg += ` — ${error.details}`;
  } catch {}

  if (code === "TOKEN_LIMIT_EXCEEDED") {
    msg = "Você atingiu o limite mensal de uso da IA. Atualize para o plano Pro para continuar.";
  }

  throw new ApiError(msg, response.status, code);
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

export async function ocrDocument(
  fileUri: string,
  mimeType: string,
  categories: Array<{ id: string; name: string }> = []
): Promise<{ text: string; draft?: Record<string, unknown> }> {
  const formData = new FormData();
  formData.append("document", {
    uri: fileUri,
    type: mimeType,
    name: `document.${mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg"}`,
  } as any);
  formData.append("categories", JSON.stringify(categories));

  const response = await authFetch(`${BACKEND_URL}/imports/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) await handleError(response, "Erro ao processar documento");

  return response.json();
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

// ── User Profile ────────────────────────────────────────────────────

export async function getMe(): Promise<{ id: string; name: string | null; email: string }> {
  const response = await authFetch(`${BACKEND_URL}/auth/me`);
  if (!response.ok) await handleError(response, "Erro ao buscar perfil");
  return response.json();
}

// ── Goals ───────────────────────────────────────────────────────────

export interface GoalData {
  id: string;
  name: string;
  targetValue: number;
  savedValue: number;
  progress: number;
  remaining: number;
  estimatedMonths: number | null;
  deadline: string | null;
  icon: string;
  color: string;
}

export async function getGoals(): Promise<GoalData[]> {
  const response = await authFetch(`${BACKEND_URL}/goals`);
  if (!response.ok) await handleError(response, "Erro ao buscar metas");
  return response.json();
}

export async function createGoal(data: { name: string; targetValue: number; savedValue?: number; deadline?: string; icon?: string; color?: string }) {
  const response = await authFetch(`${BACKEND_URL}/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) await handleError(response, "Erro ao criar meta");
  return response.json();
}

export async function depositGoal(id: string, amount: number) {
  const response = await authFetch(`${BACKEND_URL}/goals/${id}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) await handleError(response, "Erro ao depositar na meta");
  return response.json();
}

// ── Streak ──────────────────────────────────────────────────────────

export interface StreakData {
  streak: number;
  todayRegistered: boolean;
  weekDays: { label: string; date: string; active: boolean }[];
  totalDays: number;
}

export async function getStreak(): Promise<StreakData> {
  const response = await authFetch(`${BACKEND_URL}/streak`);
  if (!response.ok) await handleError(response, "Erro ao buscar streak");
  return response.json();
}

export async function checkinStreak(): Promise<{ date: string; actions: number; isNew: boolean }> {
  const response = await authFetch(`${BACKEND_URL}/streak/checkin`, { method: "POST" });
  if (!response.ok) await handleError(response, "Erro ao registrar streak");
  return response.json();
}

// ── Dashboard Score ─────────────────────────────────────────────────

export interface ScoreData {
  score: number;
  maxScore: number;
  label: string;
  breakdown: {
    streak: { value: number; max: number; description: string };
    frequency: { value: number; max: number; description: string };
    goals: { value: number; max: number; description: string };
    tenure: { value: number; max: number; description: string };
  };
}

export async function getDashboardScore(): Promise<ScoreData> {
  const response = await authFetch(`${BACKEND_URL}/dashboard/score`);
  if (!response.ok) await handleError(response, "Erro ao buscar score");
  return response.json();
}

// ── Auto-save ──────────────────────────────────────────────────────────

export async function autoSaveTransaction(transaction: {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  paymentMethod?: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER" | "BOLETO" | "MERCADO_PAGO" | "CASH" | "OTHER";
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
