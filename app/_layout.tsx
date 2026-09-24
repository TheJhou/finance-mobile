import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeRoot, type Theme as NavigationTheme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, Text, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LockScreen } from "@/components/lock-screen";
import { isAuthenticated } from "@/lib/auth";
import {
  isAutoLockSuppressed,
  isBiometricEnabled,
  onBiometricEnabledChange,
  onBiometricUnlockChange,
  setBiometricUnlocked,
  shouldLockAfterBackground,
} from "@/lib/biometric";
import { getDb } from "@/lib/db";
import { colors, spacing } from "@/lib/theme";
import { ThemeProvider, useTheme, useThemedStyles } from "@/lib/theme-context";

function RootNavigator() {
  const styles = useThemedStyles(createStyles);

  // ── Fase 1: checagem de biometria (AsyncStorage, ~5 ms) ──────────────
  // Começa com locked=false; se biometria estiver ativa, vira true assim
  // que a leitura terminar — antes de qualquer frame do app ser exibido.
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  // Cobre o conteúdo enquanto o app está em segundo plano (miniatura de apps recentes)
  const [covered, setCovered] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const leftForExternalFlowRef = useRef(false);

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

  // Acompanha a biometria sendo ligada/desligada durante a sessão (Segurança, logout)
  useEffect(() => {
    return onBiometricEnabledChange((enabled) => {
      setBiometricEnabled(enabled);
      if (!enabled) setLocked(false);
    });
  }, []);

  // Só "background" conta: "inactive" dispara com o prompt de Face ID e a central
  // de notificações. Voltar ao app pede a digital, exceto quando a saída foi
  // um fluxo externo do próprio app (câmera, seletores, compra — withoutAutoLock).
  useEffect(() => {
    if (!biometricEnabled) {
      setCovered(false);
      return;
    }
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        backgroundedAtRef.current = Date.now();
        leftForExternalFlowRef.current = isAutoLockSuppressed();
        setCovered(true);
      } else if (nextState === "active") {
        const suppressed = leftForExternalFlowRef.current || isAutoLockSuppressed();
        if (shouldLockAfterBackground(backgroundedAtRef.current, Date.now(), suppressed)) {
          void setBiometricUnlocked(false);
          setLocked(true);
        }
        backgroundedAtRef.current = null;
        leftForExternalFlowRef.current = false;
        setCovered(false);
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

  let content: ReactNode;
  if (error) {
    content = (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Falha ao iniciar</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  } else if (!appReady || isAuth === null) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  } else {
    content = (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(app)" />
      </Stack>
    );
  }

  // A navegação fica sempre montada; bloqueio e cobertura são overlays.
  // Trocar a árvore de rotas desmontava as telas e perdia resultados de
  // câmera/seletores e o listener de compras.
  return (
    <View style={styles.root}>
      <View style={styles.root} importantForAccessibility={locked ? "no-hide-descendants" : "auto"}>
        {content}
      </View>
      {locked ? (
        <View style={StyleSheet.absoluteFill}>
          {/* Só pede a digital depois que o app terminou de montar: montar a
              navegação junto com o prompt o cancelava na hora no Android */}
          <LockScreen canPrompt={appReady} />
        </View>
      ) : covered ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]} />
      ) : null}
    </View>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

/**
 * Passa as cores do app para o React Navigation. Sem isso ele usa o tema
 * claro padrão (fundo #f2f2f2), que aparece como um clarão durante as
 * transições de tela no tema escuro.
 */
function NavigationThemeProvider({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
      },
    };
  }, [isDark]);
  return <NavigationThemeRoot value={navigationTheme}>{children}</NavigationThemeRoot>;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NavigationThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <RootNavigator />
        </SafeAreaProvider>
      </NavigationThemeProvider>
    </ThemeProvider>
  );
}

function createStyles() {
  return StyleSheet.create({
    root: { flex: 1 },
    cover: { backgroundColor: colors.background },
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
