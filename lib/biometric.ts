import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const BIOMETRIC_ENABLED_KEY = "biometric_auth_enabled";

export async function isBiometricAvailable(): Promise<{
  available: boolean;
  biometricType: LocalAuthentication.AuthenticationType[];
  hasHardware: boolean;
  enrolled: boolean;
}> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = hasHardware && await LocalAuthentication.isEnrolledAsync();
  const available = hasHardware && enrolled;
  const biometricType = available ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
  return { available, biometricType, hasHardware, enrolled };
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

type EnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<EnabledListener>();

/** Notifica quando a biometria é ligada/desligada (tela de Segurança, logout). */
export function onBiometricEnabledChange(listener: EnabledListener): () => void {
  enabledListeners.add(listener);
  return () => { enabledListeners.delete(listener); };
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
  enabledListeners.forEach((l) => l(enabled));
}

/**
 * Folga mínima em segundo plano antes de exigir biometria de novo (absorve
 * piscadas de background do sistema). Com a biometria ativada, sair do app e
 * voltar pede a digital; a exceção são as telas externas abertas pelo
 * próprio app, marcadas com withoutAutoLock.
 */
export const BIOMETRIC_LOCK_GRACE_MS = 2_000;

/**
 * Depois de um fluxo externo terminar, o evento "active" do AppState pode
 * chegar um pouco depois do resultado; essa janela evita bloquear nesse meio.
 */
const EXTERNAL_FLOW_TAIL_MS = 3_000;

let activeExternalFlows = 0;
let lastExternalFlowEndedAt = 0;

/**
 * Executa um fluxo que leva o app para segundo plano por iniciativa dele
 * mesmo (câmera, galeria, seletor de arquivos, compartilhar, pagamento,
 * permissões, o próprio prompt de biometria) sem exigir a digital na volta.
 */
export async function withoutAutoLock<T>(task: () => Promise<T>): Promise<T> {
  activeExternalFlows++;
  try {
    return await task();
  } finally {
    activeExternalFlows--;
    lastExternalFlowEndedAt = Math.max(lastExternalFlowEndedAt, Date.now());
  }
}

/** Versão para chamadas síncronas que abrem outra tela (ex.: configurações do sistema). */
export function suspendAutoLockFor(ms: number): void {
  lastExternalFlowEndedAt = Math.max(lastExternalFlowEndedAt, Date.now() + ms - EXTERNAL_FLOW_TAIL_MS);
}

/** Encerra uma janela aberta por suspendAutoLockFor (ex.: a compra terminou). */
export function resumeAutoLock(): void {
  lastExternalFlowEndedAt = Date.now();
}

export function isAutoLockSuppressed(now = Date.now()): boolean {
  return activeExternalFlows > 0 || now - lastExternalFlowEndedAt < EXTERNAL_FLOW_TAIL_MS;
}

/**
 * Decide, na volta para o app, se é preciso pedir a digital.
 * `suppressed` indica se havia um fluxo externo do app quando ele saiu de cena.
 */
export function shouldLockAfterBackground(
  backgroundedAt: number | null,
  now: number,
  suppressed = false
): boolean {
  if (backgroundedAt === null || suppressed) return false;
  return now - backgroundedAt >= BIOMETRIC_LOCK_GRACE_MS;
}

const BIOMETRIC_UNLOCKED_KEY = "biometric_unlocked";

type UnlockListener = (unlocked: boolean) => void;
const unlockListeners = new Set<UnlockListener>();

export function onBiometricUnlockChange(listener: UnlockListener): () => void {
  unlockListeners.add(listener);
  return () => { unlockListeners.delete(listener); };
}

function notifyUnlockChange(unlocked: boolean) {
  unlockListeners.forEach((l) => l(unlocked));
}

export async function isBiometricUnlocked(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_UNLOCKED_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setBiometricUnlocked(unlocked: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_UNLOCKED_KEY, unlocked ? "true" : "false");
  notifyUnlockChange(unlocked);
}

export interface BiometricResult {
  success: boolean;
  /** Mensagem para o usuário */
  error?: string;
  /** Código da biblioteca (user_cancel, system_cancel, app_cancel, lockout...) */
  code?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  user_cancel: "Autenticação cancelada",
  user_fallback: "Autenticação cancelada",
  system_cancel: "Autenticação interrompida pelo sistema",
  app_cancel: "Autenticação interrompida",
  not_available: "Biometria não disponível",
  not_enrolled: "Nenhuma biometria ou bloqueio de tela cadastrado no aparelho",
  lockout: "Muitas tentativas. Use a senha do aparelho ou tente mais tarde",
  timeout: "Tempo esgotado",
  unable_to_process: "Não foi possível ler a biometria. Tente de novo",
  authentication_failed: "Autenticação falhou",
};

export async function authenticateWithBiometrics(
  promptMessage = "Autentique-se para acessar o app"
): Promise<BiometricResult> {
  try {
    const availability = await isBiometricAvailable();
    if (!availability.hasHardware) {
      return { success: false, error: "Biometria não disponível neste dispositivo", code: "not_available" };
    }
    if (!availability.enrolled) {
      return { success: false, error: "Nenhuma biometria cadastrada no dispositivo", code: "not_enrolled" };
    }

    // Em alguns aparelhos o prompt é uma tela do sistema e leva o app para
    // segundo plano: sem isso, a volta do prompt bloquearia o app de novo.
    const result = await withoutAutoLock(() =>
      LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: "Usar senha do dispositivo",
        cancelLabel: "Cancelar",
        disableDeviceFallback: false,
      })
    );

    if (result.success) {
      return { success: true };
    }
    return {
      success: false,
      error: ERROR_MESSAGES[result.error] ?? "Falha na autenticação",
      code: result.error,
    };
  } catch {
    return { success: false, error: "Erro ao iniciar autenticação biométrica", code: "exception" };
  }
}

/** Fecha um prompt de biometria aberto (ex.: a tela de bloqueio saiu). */
export function cancelBiometricPrompt(): void {
  LocalAuthentication.cancelAuthenticate().catch(() => {});
}

export function getBiometricTypeName(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Biometria";
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Reconhecimento Facial";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "Íris";
  return "Biometria";
}
