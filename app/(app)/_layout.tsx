import { AppHeader } from "@/components/app-header";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { getStoredUserEmail, isAuthenticated } from "@/lib/auth";
import { BackupScheduler } from "@/lib/backup-scheduler";
import { startGlobalPurchaseHandling } from "@/lib/iap";
import { adoptLocalDataOwnerIfMissing } from "@/lib/local-data";
import { colors } from "@/lib/theme";
import { useTheme, useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, useSegments } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const PUBLIC_SCREENS = new Set(["terms", "forgot-password", "privacy"]);

export default function AppLayout() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const segments = useSegments();
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  const tabBarStyle = useMemo(() => ({
    backgroundColor: isDark ? "#2a2740" : "#e5e7eb",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
    height: 60,
    paddingBottom: 6,
  }), [isDark]);

  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle,
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: "600" as const,
    },
    safeAreaInsets: { top: 0 },
    // isDark sinaliza a troca de tema: `colors` é mutado por applyTheme (ver useThemedStyles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isDark, tabBarStyle]);

  useNotificationListener();

  // Compras são processadas aqui, e não na tela Plano, para não se perderem
  // se o usuário sair da tela ou fechar o app durante o pagamento.
  useEffect(() => {
    if (!authed) return;
    const sub = startGlobalPurchaseHandling();
    return () => sub.remove();
  }, [authed]);

  // Initialize backup scheduler
  useEffect(() => {
    BackupScheduler.initialize().catch(error => {
      console.error('[AppLayout] Failed to initialize backup scheduler:', error);
    });
  }, []);

  useEffect(() => {
    isAuthenticated().then((auth) => {
      setAuthed(auth);
      setAuthChecking(false);
      if (auth) {
        getStoredUserEmail()
          .then(adoptLocalDataOwnerIfMissing)
          .catch((error) => console.warn("[AppLayout] Falha ao registrar dono dos dados locais:", error));
      }
    });
  }, []);

  if (authChecking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const currentScreen = segments.at(-1) as string;
  if (!authed && !PUBLIC_SCREENS.has(currentScreen)) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <AppHeader />
      <Tabs
        screenOptions={screenOptions}
      >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transações",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-vertical-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categorias",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetag-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recurring"
        options={{
          title: "Recorrentes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="refresh-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Importar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dre"
        options={{
          title: "Relatório",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plano",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="diamond-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="account" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="preferences" options={{ href: null }} />
      <Tabs.Screen name="data-privacy" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="export-data" options={{ href: null }} />
      <Tabs.Screen name="billing" options={{ href: null }} />
      <Tabs.Screen name="backup" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="forgot-password" options={{ href: null }} />
      <Tabs.Screen name="health" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
}
