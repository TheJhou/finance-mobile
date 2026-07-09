import { AppHeader } from "@/components/app-header";
import { useNotificationListener } from "@/hooks/use-notification-listener";
import { isAuthenticated } from "@/lib/auth";
import { BackupScheduler } from "@/lib/backup-scheduler";
import { colors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
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
  const styles = useMemo(() => createStyles(), [isDark]);

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
  }), [isDark, tabBarStyle]);

  useNotificationListener();

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
