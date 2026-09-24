import { authenticateWithBiometrics, cancelBiometricPrompt, isAutoLockSuppressed, setBiometricUnlocked } from "@/lib/biometric";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, InteractionManager, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Espera após o app assentar antes de abrir o prompt de biometria. */
const PROMPT_DELAY_MS = 350;
/**
 * Falha mais rápida que isso não foi o usuário cancelando: o sistema fechou o
 * prompt (ex.: telas sendo montadas por baixo). Nesse caso tenta de novo uma vez.
 */
const FAST_FAILURE_MS = 1_000;
const RETRYABLE_CODES = new Set(["user_cancel", "system_cancel", "app_cancel", "unknown", "exception"]);

/**
 * Tela de bloqueio renderizada como overlay sobre a navegação (ver app/_layout.tsx).
 * Ficar por cima, em vez de substituir as rotas, preserva o estado das telas.
 *
 * `canPrompt`: o app terminou de montar. Abrir o prompt enquanto a navegação
 * ainda monta fazia o Android cancelá-lo na hora ("Autenticação cancelada"
 * sem o usuário tocar em nada).
 */
export function LockScreen({ canPrompt = true }: Readonly<{ canPrompt?: boolean }>) {
  const styles = useThemedStyles(createStyles);
  const [error, setError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Refs para evitar stale closures e re-disparos indesejados
  const mountedRef = useRef(true);
  const isAuthenticatingRef = useRef(false);
  const canPromptRef = useRef(canPrompt);
  canPromptRef.current = canPrompt;
  const scheduledRef = useRef<{ cancel: () => void } | null>(null);

  const authenticate = useCallback(async (isAutoRetry: boolean): Promise<void> => {
    if (isAuthenticatingRef.current || !mountedRef.current) return;
    isAuthenticatingRef.current = true;
    setAuthenticating(true);
    setError(null);

    const startedAt = Date.now();
    const result = await authenticateWithBiometrics("Autentique-se para acessar o app");

    // Componente pode ter desmontado durante o await
    if (!mountedRef.current) return;

    if (result.success) {
      await setBiometricUnlocked(true);
      // RootNavigator reage via onBiometricUnlockChange e remove a lock screen
      return;
    }

    isAuthenticatingRef.current = false;
    const failedFast = Date.now() - startedAt < FAST_FAILURE_MS;
    if (!isAutoRetry && failedFast && result.code && RETRYABLE_CODES.has(result.code)) {
      schedulePrompt(true);
      return;
    }
    setAuthenticating(false);
    setError(result.error ?? "Falha na autenticação");
    // schedulePrompt é estável (só usa refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Abre o prompt depois que animações/montagens em andamento terminarem. */
  const schedulePrompt = useCallback((isAutoRetry = false) => {
    scheduledRef.current?.cancel();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => void authenticate(isAutoRetry), PROMPT_DELAY_MS);
    });
    scheduledRef.current = {
      cancel: () => {
        interaction.cancel();
        if (timer) clearTimeout(timer);
      },
    };
  }, [authenticate]);

  // Primeiro prompt: quando o app terminou de montar e está em primeiro plano
  useEffect(() => {
    if (canPrompt && AppState.currentState === "active") schedulePrompt();
  }, [canPrompt, schedulePrompt]);

  // Voltou ao app com a tela bloqueada (ex.: cancelou, saiu e voltou): pede de
  // novo. Não conta a volta do próprio prompt, que em alguns aparelhos é uma
  // tela do sistema — senão cancelar reabriria o prompt em loop.
  useEffect(() => {
    let leftDuringOwnFlow = false;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        leftDuringOwnFlow = isAutoLockSuppressed();
      } else if (state === "active") {
        const shouldPrompt = !leftDuringOwnFlow && canPromptRef.current && !isAuthenticatingRef.current;
        leftDuringOwnFlow = false;
        if (shouldPrompt) schedulePrompt();
      }
    });
    return () => sub.remove();
  }, [schedulePrompt]);

  // Saiu da tela (desbloqueou, ou não havia sessão): não deixa prompt aberto
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scheduledRef.current?.cancel();
      if (isAuthenticatingRef.current) cancelBiometricPrompt();
    };
  }, []);

  const tryAuthenticate = useCallback(() => void authenticate(false), [authenticate]);

  // Enquanto bloqueado, o botão voltar do Android não pode navegar nas telas de baixo
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>App Bloqueado</Text>
        <Text style={styles.subtitle}>
          Autentique-se com sua biometria para continuar
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.authButton}
          onPress={tryAuthenticate}
          disabled={authenticating}
          activeOpacity={0.7}
        >
          <Ionicons name="finger-print-outline" size={24} color={colors.textInverse} />
          <Text style={styles.authButtonText}>
            {authenticating ? "Autenticando..." : "Usar biometria"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      gap: spacing.lg,
    },
    iconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.danger + "1a",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
      fontWeight: "600",
    },
    authButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      marginTop: spacing.sm,
    },
    authButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textInverse,
    },
  });
}
