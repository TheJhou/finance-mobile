import { AppHeader } from "@/components/app-header";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { getStoredUserEmail, getStoredUserId, isAuthenticated } from "@/lib/auth";
import { BackupScheduler } from "@/lib/backup-scheduler";
import { startGlobalPurchaseHandling } from "@/lib/iap";
import { adoptLocalDataOwnerIfMissing } from "@/lib/local-data";
import { colors } from "@/lib/theme";
import { useTheme, useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, useSegments } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PUBLIC_SCREENS = new Set(["terms", "forgot-password", "privacy"]);

/** Altura útil da barra de abas (ícone + rótulo), sem o espaço dos botões do sistema. */
const TAB_BAR_CONTENT_HEIGHT = 54;
const TAB_BAR_MIN_BOTTOM_PADDING = 6;

export default function AppLayout() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const segments = useSegments();
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  // No SDK 54 o app desenha até a borda da tela (edge-to-edge): a altura fixa
  // anterior (60 com paddingBottom 6) deixava as abas por baixo dos botões de
  // navegação do Android. O espaço inferior agora vem do inset do sistema.
  const tabBarStyle = useMemo(() => ({
    backgroundColor: isDark ? "#2a2740" : "#e5e7eb",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
    height: TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_PADDING),
    paddingBottom: Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_PADDING),
  }), [isDark, insets.bottom]);

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
    // Sem fundo definido, a troca de aba mostrava o fundo padrão por um instante
    sceneStyle: { backgroundColor: colors.background },
    // Transição curta: telas como Conta e Segurança apareciam "de supetão"
    animation: "fade" as const,
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
        Promise.all([getStoredUserId(), getStoredUserEmail()])
          .then(([id, email]) => adoptLocalDataOwnerIfMissing({ id, email }))
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
        // Conta, Segurança, Backup etc. são abas ocultas: com o padrão
        // ("firstRoute") o voltar do Android pulava direto para o Dashboard
        backBehavior="history"
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
