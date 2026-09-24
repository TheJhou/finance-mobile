import { authenticateWithBiometrics, setBiometricUnlocked } from "@/lib/biometric";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Tela de bloqueio renderizada como overlay sobre a navegação (ver app/_layout.tsx).
 * Ficar por cima, em vez de substituir as rotas, preserva o estado das telas.
 */
export function LockScreen() {
  const styles = useThemedStyles(createStyles);
  const [error, setError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Refs para evitar stale closures e re-disparos indesejados
  const mountedRef = useRef(true);
  const isAuthenticatingRef = useRef(false); // guarda ref (não state) para o guard

  const tryAuthenticate = useCallback(async () => {
    // Guard via ref: seguro mesmo dentro de closures stale
    if (isAuthenticatingRef.current) return;
    isAuthenticatingRef.current = true;
    setAuthenticating(true);
    setError(null);

    const result = await authenticateWithBiometrics("Autentique-se para acessar o app");

    // Componente pode ter desmontado durante o await
    if (!mountedRef.current) return;

    if (result.success) {
      await setBiometricUnlocked(true);
      // RootNavigator reage via onBiometricUnlockChange e remove a lock screen
    } else {
      isAuthenticatingRef.current = false;
      setAuthenticating(false);
      setError(result.error ?? "Falha na autenticação");
    }
  }, []);

  // Dispara biometria IMEDIATAMENTE na montagem — sem deps que causem re-disparo
  useEffect(() => {
    mountedRef.current = true;
    void tryAuthenticate();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intencional: só na montagem. Retry é via botão manual.

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
