import DrawerMenu from "@/components/drawer-menu";
import { getStoredUserName } from "@/lib/auth";
import { getProfilePhotoUri } from "@/lib/profile-photo";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_TITLES: Record<string, string> = {
  dashboard: "Início",
  transactions: "Transações",
  categories: "Categorias",
  recurring: "Recorrentes",
  notifications: "Importar",
  dre: "Relatório",
  plan: "Plano",
  account: "Minha Conta",
  security: "Segurança",
  preferences: "Preferências",
  "data-privacy": "Dados e Privacidade",
  support: "Suporte e Sobre",
  "export-data": "Exportar Dados",
  billing: "Assinatura",
  backup: "Backup",
  privacy: "Política de Privacidade",
  terms: "Termos de Uso",
  "forgot-password": "Recuperar Senha",
};

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const currentScreen = segments.at(-1) as string;
  const headerTitle = title ?? SCREEN_TITLES[currentScreen] ?? "Finance";

  const loadUserData = useCallback(async () => {
    const name = await getStoredUserName();
    setUserName(name);
    const photo = await getProfilePhotoUri();
    setProfilePhoto(photo);
  }, []);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  return (
    <>
      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        userName={userName}
      />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.push("/(app)/account")}
        >
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={18} color={colors.textSecondary} />
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setDrawerVisible(true)}
        >
          <Ionicons name="menu" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.primary,
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
  });
}
