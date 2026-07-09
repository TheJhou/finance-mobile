import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isAuthenticated } from "@/lib/auth";
import { isBiometricEnabled } from "@/lib/biometric";
import { getDb } from "@/lib/db";
import { colors, spacing } from "@/lib/theme";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDb(), isAuthenticated()])
      .then(([, authenticated]) => {
        if (!cancelled) {
          setReady(true);
          setIsAuth(authenticated);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao inicializar DB");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuth) {
      isBiometricEnabled().then(setBiometricEnabled);
    }
  }, [isAuth]);

  useEffect(() => {
    if (isAuth && biometricEnabled) {
      setLocked(true);
    }
  }, [isAuth, biometricEnabled]);

  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "active" && isAuth && biometricEnabled) {
        setLocked(true);
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [isAuth, biometricEnabled]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Falha ao iniciar</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  if (!ready || isAuth === null) {
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
      <Stack.Screen name="index" options={{ href: isAuth ? null : "/" }} />
      <Stack.Screen name="login" options={{ href: isAuth ? null : "/login" }} />
      <Stack.Screen name="(app)" options={{ href: isAuth ? "/(app)" : null }} />
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

const styles = StyleSheet.create({
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
