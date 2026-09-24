import { authFetch, saveTokens, setStoredUserEmail } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export interface UpdateProfileData {
  name?: string;
  email?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export interface SessionInfo {
  id: string;
  device: string;
  platform: string;
  lastActive: string;
  current: boolean;
}

export interface AccountInfo {
  appVersion: string;
  buildVersion: string;
  environment: string;
  lastSync: string | null;
  isOnline: boolean;
  pendingSyncCount: number;
}

export async function updateProfile(data: UpdateProfileData): Promise<{ name: string; email: string }> {
  const response = await authFetch(`${BACKEND_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao atualizar perfil");
  }
  return response.json();
}

/**
 * Pede a troca de e-mail: o backend confere a senha e envia um código de
 * 6 dígitos ao novo endereço. O e-mail só muda em confirmEmailChange.
 */
export async function requestEmailChange(email: string, currentPassword: string): Promise<{ message: string }> {
  const response = await authFetch(`${BACKEND_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, currentPassword }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Erro ao solicitar troca de e-mail");
  }
  return { message: body.message ?? `Enviamos um código para ${email}.` };
}

export async function confirmEmailChange(code: string): Promise<{ name: string | null; email: string }> {
  const response = await authFetch(`${BACKEND_URL}/auth/confirm-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Erro ao confirmar e-mail");
  }
  await setStoredUserEmail(body.email);
  return body;
}

export async function changePassword(data: ChangePasswordData): Promise<void> {
  const response = await authFetch(`${BACKEND_URL}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Erro ao alterar senha");
  }
  // O backend encerra todas as sessões e devolve tokens novos para este aparelho
  if (body.accessToken && body.refreshToken) {
    await saveTokens(body.accessToken, body.refreshToken);
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const response = await authFetch(`${BACKEND_URL}/auth/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao excluir conta");
  }
}

export async function getSessions(): Promise<SessionInfo[]> {
  const response = await authFetch(`${BACKEND_URL}/auth/sessions`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao carregar sessões");
  }
  return response.json();
}

export async function revokeSession(sessionId: string): Promise<void> {
  const response = await authFetch(`${BACKEND_URL}/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao encerrar sessão");
  }
}

/** Encerra todas as sessões, inclusive a deste aparelho (é preciso entrar de novo). */
export async function revokeAllSessions(): Promise<void> {
  const response = await authFetch(`${BACKEND_URL}/auth/sessions`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao encerrar sessões");
  }
}

export async function exportAccountData(): Promise<Blob> {
  const response = await authFetch(`${BACKEND_URL}/auth/export-data`);
  if (!response.ok) throw new Error("Erro ao exportar dados");
  return response.blob();
}
