import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isAuthenticated } from "@/lib/auth";
import { isBiometricEnabled, isBiometricUnlocked, onBiometricUnlockChange, setBiometricUnlocked } from "@/lib/biometric";
import { getDb } from "@/lib/db";
import { colors, spacing } from "@/lib/theme";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

function RootNavigator() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checkingLock, setCheckingLock] = useState(true);

  // Single parallel init: DB + auth + biometric settings — eliminates sequential useEffect chain
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDb(),
      isAuthenticated(),
      isBiometricEnabled(),
    ])
      .then(([, authenticated, bioEnabled]) => {
        if (cancelled) return;
        setReady(true);
        setIsAuth(authenticated);
        setBiometricEnabled(authenticated && bioEnabled);
        if (!authenticated || !bioEnabled) {
          setLocked(false);
          setCheckingLock(false);
        } else {
          // Biometric enabled — always lock on startup, never trust persisted unlocked state
          setLocked(true);
          setCheckingLock(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao inicializar DB");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear unlocked flag when app goes to background so it re-prompts on return
  useEffect(() => {
    if (!isAuth || !biometricEnabled) return;
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        void setBiometricUnlocked(false);
        setLocked(true);
      } else if (nextState === "active") {
        // Re-check lock when returning from background
        isBiometricUnlocked().then((unlocked) => {
          setLocked(!unlocked);
        });
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [isAuth, biometricEnabled]);

  // Subscribe to unlock events from lock screen — instant reaction, no polling
  useEffect(() => {
    if (!biometricEnabled) return;
    return onBiometricUnlockChange((unlocked) => {
      setLocked(!unlocked);
    });
  }, [biometricEnabled]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Falha ao iniciar</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  if (!ready || isAuth === null || checkingLock) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (locked) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="lock" />
      </Stack>
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
