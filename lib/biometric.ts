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

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
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

export async function authenticateWithBiometrics(
  promptMessage = "Autentique-se para acessar o app"
): Promise<{ success: boolean; error?: string }> {
  try {
    const availability = await isBiometricAvailable();
    if (!availability.hasHardware) {
      return { success: false, error: "Biometria não disponível neste dispositivo" };
    }
    if (!availability.enrolled) {
      return { success: false, error: "Nenhuma biometria cadastrada no dispositivo" };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Usar senha do dispositivo",
      cancelLabel: "Cancelar",
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    const errorMessages: Record<string, string> = {
      user_cancel: "Autenticação cancelada",
      user_fallback: "Autenticação cancelada",
      not_available: "Biometria não disponível",
      not_enrolled: "Nenhuma biometria cadastrada no dispositivo",
      lockout: "Muitas tentativas. Tente novamente mais tarde",
      timeout: "Tempo esgotado",
      system_cancel: "Autenticação cancelada pelo sistema",
      authentication_failed: "Autenticação falhou",
    };

    return {
      success: false,
      error: errorMessages[result.error] ?? "Falha na autenticação",
    };
  } catch {
    return { success: false, error: "Erro ao iniciar autenticação biométrica" };
  }
}

export function getBiometricTypeName(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Biometria";
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Reconhecimento Facial";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "Íris";
  return "Biometria";
}
