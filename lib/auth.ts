import { APP_SECRET, BACKEND_URL } from "@/lib/config";
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

// ── Public API ─────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  const token = await getStoredValue("jwt_access_token");
  if (!token) return null;

  if (!isTokenExpired(token)) return token;

  // Token expirado — tentar refresh
  const refreshed = await refreshAccessToken();
  return refreshed;
}

export async function getStoredTokens(): Promise<AuthTokens | null> {
  const accessToken = await getStoredValue("jwt_access_token");
  const refreshToken = await getStoredValue("jwt_refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

export async function hasStoredSession(): Promise<boolean> {
  const accessToken = await getStoredValue("jwt_access_token");
  const refreshToken = await getStoredValue("jwt_refresh_token");
  return !!accessToken && !!refreshToken;
}

export async function register(name: string, email: string, password: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
    },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    let msg = "Falha ao criar conta";
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  await setStoredValue("jwt_access_token", data.accessToken);
  await setStoredValue("jwt_refresh_token", data.refreshToken);
  if (data.user?.name) await setStoredValue("user_name", data.user.name);
  if (data.user?.email) await setStoredValue("user_email", data.user.email);
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    let msg = "Falha ao fazer login";
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  await setStoredValue("jwt_access_token", data.accessToken);
  await setStoredValue("jwt_refresh_token", data.refreshToken);
  if (data.user?.name) await setStoredValue("user_name", data.user.name);
  if (data.user?.email) await setStoredValue("user_email", data.user.email);
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const response = await fetch(`${BACKEND_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function logout(): Promise<void> {
  await removeStoredValue("jwt_access_token");
  await removeStoredValue("jwt_refresh_token");
  await removeStoredValue("user_name");
  await removeStoredValue("user_email");
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

export async function setStoredUserName(name: string): Promise<void> {
  await setStoredValue("user_name", name);
}

export async function hasAcceptedTerms(): Promise<boolean> {
  const accepted = await getStoredValue("terms_accepted");
  return accepted === "true";
}

export async function setTermsAccepted(): Promise<void> {
  await setStoredValue("terms_accepted", "true");
}

let pendingRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    const refreshToken = await getStoredValue("jwt_refresh_token");
    if (!refreshToken || isTokenExpired(refreshToken, 0)) {
      await logout();
      return null;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await logout();
        return null;
      }

      const data = await response.json();
      await setStoredValue("jwt_access_token", data.accessToken);
      if (data.refreshToken) {
        await setStoredValue("jwt_refresh_token", data.refreshToken);
      }
      return data.accessToken;
    } catch (error) {
      console.warn("[Auth] Token refresh failed (network error, keeping session):", error);
      return null;
    }
  })();

  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}

// ── Authenticated fetch ────────────────────────────────────────────────

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  // Se 401, tentar refresh uma vez
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    headers.set("Authorization", `Bearer ${newToken}`);
    return fetch(url, { ...options, headers });
  }

  return response;
}
