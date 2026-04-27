import { getDb } from "@/lib/db";

const BACKEND_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

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

// ── Storage ────────────────────────────────────────────────────────────

async function getStoredValue(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?",
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function setStoredValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}

async function removeStoredValue(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM settings WHERE key = ?", [key]);
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
}

export async function logout(): Promise<void> {
  await removeStoredValue("jwt_access_token");
  await removeStoredValue("jwt_refresh_token");
}

async function refreshAccessToken(): Promise<string | null> {
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
  } catch {
    await logout();
    return null;
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
