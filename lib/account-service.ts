import { authFetch } from "@/lib/auth";
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

export async function changePassword(data: ChangePasswordData): Promise<void> {
  const response = await authFetch(`${BACKEND_URL}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Erro ao alterar senha");
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
  if (!response.ok) return [];
  return response.json();
}

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
