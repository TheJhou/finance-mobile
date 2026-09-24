import { logout } from "@/lib/auth";
import { BackupSystem } from "@/lib/backup";
import { setBiometricEnabled } from "@/lib/biometric";
import { wipeUserData } from "@/lib/db";
import { deleteProfilePhoto } from "@/lib/profile-photo";
import { resetMonthStartDayCache } from "@/lib/settings";
import { resetTokenLimitStatus } from "@/lib/token-limit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

/** E-mail da conta dona dos dados financeiros guardados neste aparelho. */
const LOCAL_DATA_OWNER_KEY = "local_data_owner";

/**
 * Chaves do AsyncStorage que pertencem ao usuário.
 * Ficam de fora preferências do aparelho: tema (app_theme_mode) e finance_device_id.
 */
const USER_ASYNC_STORAGE_KEYS = [
  "ai_forecast_cache",
  "finance_pending_notifications",
  "biometric_auth_enabled",
  "biometric_unlocked",
  "commitment_alert_cooldown",
  "finance_backup_schedule",
  "backup_scheduler_config",
  "backup_scheduler_last_run",
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Apaga todos os dados do usuário guardados no aparelho: banco local,
 * backups locais, foto de perfil, preferências da conta e lembretes agendados.
 * Não mexe nos tokens de sessão — isso é responsabilidade do logout.
 */
export async function clearLocalUserData(): Promise<void> {
  await wipeUserData();

  // As etapas abaixo são limpeza complementar: uma falha não deve impedir as demais.
  const steps: [string, () => Promise<unknown> | void][] = [
    ["biometria", () => setBiometricEnabled(false)],
    ["backups locais", () => BackupSystem.deleteAllLocalBackups()],
    ["foto de perfil", () => deleteProfilePhoto()],
    ["AsyncStorage", () => AsyncStorage.multiRemove(USER_ASYNC_STORAGE_KEYS)],
    ["notificações agendadas", () => Notifications.cancelAllScheduledNotificationsAsync()],
    ["dono dos dados", () => SecureStore.deleteItemAsync(LOCAL_DATA_OWNER_KEY)],
  ];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.warn(`[LocalData] Falha ao limpar ${label}:`, error);
    }
  }

  resetMonthStartDayCache();
  resetTokenLimitStatus();
}

/**
 * Deve ser chamado logo após login/cadastro bem-sucedido.
 * Se os dados locais pertencem a outra conta, apaga antes de liberar o acesso,
 * para que um usuário nunca veja as finanças de outro no mesmo aparelho.
 */
export async function claimLocalDataFor(email: string): Promise<void> {
  const owner = normalizeEmail(email);
  const previousOwner = await SecureStore.getItemAsync(LOCAL_DATA_OWNER_KEY);
  if (previousOwner && previousOwner !== owner) {
    console.log("[LocalData] Conta diferente da dona dos dados locais — limpando");
    await clearLocalUserData();
  }
  await SecureStore.setItemAsync(LOCAL_DATA_OWNER_KEY, owner);
}

/**
 * Instalações antigas não registravam o dono dos dados.
 * Se já há sessão ativa e nenhum dono salvo, adota o usuário atual.
 */
export async function adoptLocalDataOwnerIfMissing(currentEmail: string | null): Promise<void> {
  if (!currentEmail) return;
  const previousOwner = await SecureStore.getItemAsync(LOCAL_DATA_OWNER_KEY);
  if (!previousOwner) {
    await SecureStore.setItemAsync(LOCAL_DATA_OWNER_KEY, normalizeEmail(currentEmail));
  }
}

/** Sai da conta apagando antes os dados locais do usuário. */
export async function signOutAndClearLocalData(): Promise<void> {
  await clearLocalUserData();
  await logout();
}

/**
 * Faz backup na nuvem e só então sai da conta.
 * Se o backup falhar, lança erro e mantém o usuário logado com os dados intactos.
 */
export async function backupThenSignOut(): Promise<void> {
  const { localResult, cloudError } = await BackupSystem.createAndUploadBackup();
  if (!localResult.success || cloudError) {
    throw new Error(
      `Não foi possível fazer o backup (${localResult.error ?? cloudError}). Você continua conectado e nenhum dado foi apagado.`
    );
  }
  await signOutAndClearLocalData();
}
