import { authFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { handleTokenLimitError } from "@/lib/token-limit";

// Upload de arquivo + processamento no servidor (OCR, transcrição, foto)
const UPLOAD_TIMEOUT_MS = 90_000;
// Chamadas que passam pela IA no backend
const AI_TIMEOUT_MS = 60_000;

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

  const error = new ApiError(msg, response.status, code);
  
  // Track token limit errors globally
  handleTokenLimitError(error);
  
  throw error;
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
    timeoutMs: UPLOAD_TIMEOUT_MS,
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
  categories: Array<{ id: string; name: string }> = [],
  maxPages = 2
): Promise<{ text: string; draft?: Record<string, unknown> }> {
  const formData = new FormData();
  formData.append("document", {
    uri: fileUri,
    type: mimeType,
    name: `document.${mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg"}`,
  } as any);
  formData.append("categories", JSON.stringify(categories));
  formData.append("maxPages", String(maxPages));

  const response = await authFetch(`${BACKEND_URL}/imports/ocr`, {
    method: "POST",
    timeoutMs: UPLOAD_TIMEOUT_MS,
    body: formData,
  });

  if (!response.ok) await handleError(response, "Erro ao processar documento");

  return response.json();
}

// ── Análise de texto ───────────────────────────────────────────────────

export async function analyzeText(
  text: string,
  source: "TEXT" | "DOCUMENT" | "AUDIO",
  categories: Array<{ id: string; name: string }>,
  context?: { bank?: string; paymentMethod?: string }
) {
  const response = await authFetch(`${BACKEND_URL}/imports/analyze`, {
    method: "POST",
    timeoutMs: AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText: text, source, categories, context }),
  });

  if (!response.ok) await handleError(response, "Erro ao analisar texto");

  const data = await response.json();

  // Normaliza o shape: o frontend sempre acessa `result.draft`.
  // Se o backend retornar os campos na raiz (sem wrapper "draft"),
  // encapsula aqui para não quebrar silenciosamente.
  if (data && typeof data === "object" && !("draft" in data)) {
    console.warn("[analyzeText] Resposta sem wrapper 'draft' — normalizando shape");
    return { draft: data };
  }

  return data;
}

// ── Extração de foto (via backend, sem API key no client) ──────────────

export async function extractFromPhoto(
  base64Image: string,
  mimeType: string,
  categories: Array<{ id: string; name: string }> = []
) {
  const response = await authFetch(`${BACKEND_URL}/imports/extract-photo`, {
    method: "POST",
    timeoutMs: UPLOAD_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, mimeType, categories }),
  });

  if (!response.ok) await handleError(response, "Erro ao processar foto");
  return response.json();
}

// ── Extração de texto livre (via backend, sem API key no client) ───────

export async function extractFromText(text: string, categories: Array<{ id: string; name: string }> = []) {
  const response = await authFetch(`${BACKEND_URL}/imports/extract-text`, {
    method: "POST",
    timeoutMs: AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, categories }),
  });

  if (!response.ok) await handleError(response, "Erro ao processar texto");
  return response.json();
}

// ── AI Forecast ─────────────────────────────────────────────────────

export interface AiForecast {
  forecastBalance: number;
  trend: "positiva" | "negativa" | "estavel";
  riskLevel: "baixo" | "medio" | "alto";
  summary: string;
  insight: string;
  savingsPotential: number;
  generatedAt: string;
  cached: boolean;
}

export async function getAiForecast(payload: {
  balance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  upcomingAmount: number;
  overdueAmount: number;
  activeRecurring: number;
  expensesByCategory: { name: string; value: number }[];
  monthlyTrend: { month: string; income: number; expense: number }[];
}): Promise<AiForecast> {
  const response = await authFetch(`${BACKEND_URL}/dashboard/ai-forecast`, {
    method: "POST",
    timeoutMs: AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) await handleError(response, "Erro ao buscar previsão IA");
  return response.json();
}

// ── User Profile ────────────────────────────────────────────────────

export async function getMe(): Promise<{ id: string; name: string | null; email: string; emailVerified?: boolean }> {
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
  source?: "TEXT" | "DOCUMENT" | "AUDIO" | "PHOTO" | "VOICE" | "BANK_NOTIFICATION";
  /** Id local da transação, para o backend não duplicar reenvios */
  externalId?: string;
}) {
  const response = await authFetch(`${BACKEND_URL}/imports/auto-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transaction),
  });

  if (!response.ok) await handleError(response, "Erro ao salvar transação");
  return response.json();
}
