import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isAuthenticated } from "@/lib/auth";
import { isBiometricEnabled, onBiometricUnlockChange, setBiometricUnlocked } from "@/lib/biometric";
import { getDb } from "@/lib/db";
import { colors, spacing } from "@/lib/theme";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

function RootNavigator() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  // ── Fase 1: checagem de biometria (AsyncStorage, ~5 ms) ──────────────
  // Começa com locked=false; se biometria estiver ativa, vira true assim
  // que a leitura terminar — antes de qualquer frame do app ser exibido.
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locked, setLocked] = useState(false);

  // ── Fase 2: inicialização do DB + auth (pode demorar mais) ───────────
  const [appReady, setAppReady] = useState(false);
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fase 1 — roda isolada e primeiro para não bloquear a lock screen
  useEffect(() => {
    let cancelled = false;
    isBiometricEnabled().then((bioEnabled) => {
      if (cancelled) return;
      setBiometricEnabled(bioEnabled);
      // Se habilitada: trava imediatamente, lock screen aparece sem delay
      setLocked(bioEnabled);
      setBiometricChecked(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Fase 2 — roda em paralelo com a fase 1 (e com a autenticação biométrica)
  useEffect(() => {
    let cancelled = false;
    Promise.all([getDb(), isAuthenticated()])
      .then(([, authenticated]) => {
        if (cancelled) return;
        setIsAuth(authenticated);
        setAppReady(true);
        // Sem sessão ativa → biometria não faz sentido, libera o acesso
        if (!authenticated) {
          setLocked(false);
          setBiometricEnabled(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao inicializar");
        // Em caso de erro de DB, não travar o usuário indefinidamente
        setLocked(false);
        setBiometricChecked(true);
        setAppReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Background → trava; foreground → a lock screen re-dispara a biometria
  useEffect(() => {
    if (!biometricEnabled) return;
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        void setBiometricUnlocked(false);
        setLocked(true);
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [biometricEnabled]);

  // Reage ao desbloqueio vindo da lock screen (sem polling)
  useEffect(() => {
    if (!biometricEnabled) return;
    return onBiometricUnlockChange((unlocked) => {
      setLocked(!unlocked);
    });
  }, [biometricEnabled]);

  // ── Antes da checagem de biometria: tela sólida (sem flash de conteúdo) ──
  // Dura apenas ~5 ms (leitura de AsyncStorage) — imperceptível ao usuário.
  if (!biometricChecked) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  // ── Lock screen: aparece imediatamente após a checagem ────────────────
  if (locked) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="lock" />
      </Stack>
    );
  }

  // ── Erro de inicialização ─────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Falha ao iniciar</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  // ── Spinner apenas para usuários SEM biometria (DB ainda carregando) ──
  if (!appReady || isAuth === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ThemedStatusBar />
        <RootNavigator />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function createStyles() {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    errorTitle: { fontSize: 16, fontWeight: "700", color: colors.danger },
    errorMsg: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
    },
  });
}
