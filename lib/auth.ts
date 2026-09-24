import { BACKEND_URL } from "@/lib/config";
import { getDeviceInfo } from "@/lib/device-info";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface DecodedPayload {
  exp: number;
  [key: string]: unknown;
}

function decodePayload(token: string): DecodedPayload | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string, marginSeconds = 30): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 >= payload.exp - marginSeconds;
}

// ── Secure Storage ────────────────────────────────────────────────────────

async function getStoredValue(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn(`[Auth] Failed to read secure value for key "${key}":`, error);
    return null;
  }
}

async function setStoredValue(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error("[Auth] Failed to store secure value:", error);
    throw new Error("Failed to store authentication data");
  }
}

async function removeStoredValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.warn(`[Auth] Failed to remove secure value for key "${key}":`, error);
  }
}

// ── Rede ─────────────────────────────────────────────────────────────

/** Prazo padrão das requisições. Uploads (OCR, áudio, backup) passam `timeoutMs` maior. */
export const REQUEST_TIMEOUT_MS = 20_000;

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/** Falha de conectividade (sem internet ou servidor sem resposta), não de autenticação. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

async function fetchWithTimeout(
  url: string,
  { timeoutMs = REQUEST_TIMEOUT_MS, ...init }: RequestOptions = {}
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const forwardAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", forwardAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted) throw error; // cancelado por quem chamou
    if (controller.signal.aborted) {
      throw new NetworkError("Tempo esgotado. Verifique sua conexão e tente novamente.");
    }
    // fetch só rejeita por falha de rede
    throw new NetworkError("Sem conexão com a internet. Verifique sua conexão e tente novamente.");
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

// ── Public API ─────────────────────────────────────────────────────────

type AccessTokenResult =
  | { status: "ok"; token: string }
  | { status: "none" } // sem sessão ou sessão recusada pelo servidor
  | { status: "offline" }; // sessão existe, mas não foi possível renovar agora

async function resolveAccessToken(): Promise<AccessTokenResult> {
  const token = await getStoredValue("jwt_access_token");
  if (!token) return { status: "none" };
  if (!isTokenExpired(token)) return { status: "ok", token };

  // Token expirado — tentar refresh
  const refreshed = await refreshAccessToken();
  if (refreshed.status === "ok") return { status: "ok", token: refreshed.token };
  return refreshed.status === "offline" ? { status: "offline" } : { status: "none" };
}

export async function getAccessToken(): Promise<string | null> {
  const result = await resolveAccessToken();
  return result.status === "ok" ? result.token : null;
}

export async function getStoredTokens(): Promise<AuthTokens | null> {
  const accessToken = await getStoredValue("jwt_access_token");
  const refreshToken = await getStoredValue("jwt_refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/**
 * Há uma sessão válida neste aparelho. Sem internet, uma sessão que não pôde
 * ser renovada continua valendo: o app funciona offline e o refresh é tentado
 * de novo na próxima requisição. Só é false sem sessão ou se o servidor recusar.
 */
export async function isAuthenticated(): Promise<boolean> {
  const result = await resolveAccessToken();
  return result.status !== "none";
}

export async function hasStoredSession(): Promise<boolean> {
  const accessToken = await getStoredValue("jwt_access_token");
  const refreshToken = await getStoredValue("jwt_refresh_token");
  return !!accessToken && !!refreshToken;
}

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user?: { id?: string | null; name?: string | null; email?: string | null };
}

async function storeSession(data: SessionResponse, fallbackEmail: string): Promise<void> {
  // Antes de liberar a sessão, garante que os dados locais pertencem a esta conta.
  // Import dinâmico evita ciclo auth → local-data → backup → auth.
  const { claimLocalDataFor } = await import("@/lib/local-data");
  await claimLocalDataFor({ id: data.user?.id ?? null, email: data.user?.email ?? fallbackEmail });

  await saveTokens(data.accessToken, data.refreshToken);
  if (data.user?.id) await setStoredValue("user_id", data.user.id);
  if (data.user?.name) await setStoredValue("user_name", data.user.name);
  if (data.user?.email) await setStoredValue("user_email", data.user.email);
}

/** Grava um par de tokens emitido pelo backend (login, refresh, troca de senha). */
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setStoredValue("jwt_access_token", accessToken);
  await setStoredValue("jwt_refresh_token", refreshToken);
}

export async function register(name: string, email: string, password: string): Promise<void> {
  const response = await fetchWithTimeout(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password, device: getDeviceInfo() }),
  });

  if (!response.ok) {
    let msg = "Falha ao criar conta";
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  await storeSession(await response.json(), email);
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetchWithTimeout(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, device: getDeviceInfo() }),
  });

  if (!response.ok) {
    let msg = "Falha ao fazer login";
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  await storeSession(await response.json(), email);
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await fetchWithTimeout(`${BACKEND_URL}/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    let msg = "Falha ao solicitar recuperação";
    try {
      const err = await response.json();
      msg = err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return response.json();
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
  confirmPassword: string
): Promise<{ message: string }> {
  const response = await fetchWithTimeout(`${BACKEND_URL}/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, code, password, confirmPassword }),
  });

  if (!response.ok) {
    let msg = "Falha ao redefinir senha";
    try {
      const err = await response.json();
      msg = err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Encerra no servidor a sessão deste aparelho (some de "Sessões ativas" e o
 * refresh token deixa de valer). Melhor esforço: sem rede, o logout local
 * segue normalmente e a sessão expira sozinha.
 */
export async function revokeCurrentSession(): Promise<void> {
  try {
    await authFetch(`${BACKEND_URL}/auth/logout`, { method: "POST", timeoutMs: 5_000 });
  } catch (error) {
    console.warn("[Auth] Não foi possível encerrar a sessão no servidor:", error);
  }
}

export async function getStoredUserId(): Promise<string | null> {
  return getStoredValue("user_id");
}

export async function logout(): Promise<void> {
  await removeStoredValue("jwt_access_token");
  await removeStoredValue("jwt_refresh_token");
  await removeStoredValue("user_name");
  await removeStoredValue("user_email");
  await removeStoredValue("user_id");
  try {
    await AsyncStorage.removeItem("ai_forecast_cache");
  } catch (error) {
    console.warn("[Auth] Failed to clear AI forecast cache:", error);
  }
  // Clear pro cache so next login fetches fresh status
  try {
    const { clearProCache } = await import("@/lib/subscription");
    clearProCache();
  } catch (error) {
    console.warn("[Auth] Failed to clear pro cache:", error);
  }
}

export async function getStoredUserName(): Promise<string | null> {
  return getStoredValue("user_name");
}

export async function getStoredUserEmail(): Promise<string | null> {
  return getStoredValue("user_email");
}

export async function setStoredUserName(name: string): Promise<void> {
  await setStoredValue("user_name", name);
}

export async function setStoredUserEmail(email: string): Promise<void> {
  await setStoredValue("user_email", email);
}

export async function hasAcceptedTerms(): Promise<boolean> {
  const accepted = await getStoredValue("terms_accepted");
  return accepted === "true";
}

export async function setTermsAccepted(): Promise<void> {
  await setStoredValue("terms_accepted", "true");
}

type RefreshResult =
  | { status: "ok"; token: string }
  | { status: "rejected" } // servidor recusou: sessão encerrada
  | { status: "offline" }; // falha de rede: sessão mantida

let pendingRefresh: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async (): Promise<RefreshResult> => {
    const refreshToken = await getStoredValue("jwt_refresh_token");
    if (!refreshToken || isTokenExpired(refreshToken, 0)) {
      await logout();
      return { status: "rejected" };
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(`${BACKEND_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken, device: getDeviceInfo() }),
      });
    } catch (error) {
      console.warn("[Auth] Token refresh failed (network error, keeping session):", error);
      return { status: "offline" };
    }

    // 5xx é instabilidade do servidor, não sessão inválida: não desloga
    if (response.status >= 500) return { status: "offline" };
    if (!response.ok) {
      await logout();
      return { status: "rejected" };
    }

    const data = await response.json();
    await setStoredValue("jwt_access_token", data.accessToken);
    if (data.refreshToken) {
      await setStoredValue("jwt_refresh_token", data.refreshToken);
    }
    return { status: "ok", token: data.accessToken };
  })();

  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}

// ── Authenticated fetch ────────────────────────────────────────────────

const SESSION_EXPIRED_MESSAGE = "Sessão expirada. Faça login novamente.";
const OFFLINE_MESSAGE = "Sem conexão com a internet. Verifique sua conexão e tente novamente.";

export async function authFetch(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const access = await resolveAccessToken();
  if (access.status === "offline") throw new NetworkError(OFFLINE_MESSAGE);
  if (access.status === "none") throw new Error(SESSION_EXPIRED_MESSAGE);

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${access.token}`);

  const response = await fetchWithTimeout(url, { ...options, headers });

  // Se 401, tentar refresh uma vez
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed.status === "offline") throw new NetworkError(OFFLINE_MESSAGE);
    if (refreshed.status === "rejected") throw new Error(SESSION_EXPIRED_MESSAGE);
    headers.set("Authorization", `Bearer ${refreshed.token}`);
    return fetchWithTimeout(url, { ...options, headers });
  }

  return response;
}
