import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import { Linking, StyleSheet, Text, View } from "react-native";

export default function SupportScreen() {
  const styles = useThemedStyles(createStyles);

  const { alert, dialog } = useAppDialog();

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildVersion = String(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1");
  const environment = __DEV__ ? "Homologação" : "Produção";

  return (
    <ScreenLayout title="Suporte e Sobre">
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="headset-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>Precisa de ajuda?</Text>
        <Text style={styles.heroText}>Estamos aqui para ajudar. Escolha uma opção abaixo.</Text>
      </View>

      <AccountSection title="Suporte">
        <AccountRow
          icon="help-circle-outline"
          iconColor={colors.info}
          label="Central de ajuda"
          onPress={() => Linking.openURL("https://help.finance.app")}
        />
        <RowSeparator />
        <AccountRow
          icon="chatbubble-outline"
          iconColor={colors.primary}
          label="Enviar feedback"
          onPress={() => Linking.openURL("mailto:support@finance.app?subject=Feedback")}
        />
        <RowSeparator />
        <AccountRow
          icon="warning-outline"
          iconColor={colors.warning}
          label="Reportar problema"
          onPress={() => Linking.openURL("mailto:support@finance.app?subject=Reportar%20Problema")}
        />
        <RowSeparator />
        <AccountRow
          icon="headset-outline"
          iconColor={colors.success}
          label="Falar com suporte"
          onPress={() => Linking.openURL("mailto:support@finance.app")}
        />
        <RowSeparator />
        <AccountRow
          icon="star-outline"
          iconColor={colors.warning}
          label="Avaliar aplicativo"
          onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=com.finance.app")}
        />
      </AccountSection>

      <AccountSection title="Informações do Aplicativo">
        <AccountRow
          icon="information-circle-outline"
          iconColor={colors.info}
          label="Versão"
          value={appVersion}
          chevron={false}
        />
        <RowSeparator />
        <AccountRow
          icon="build-outline"
          iconColor={colors.textMuted}
          label="Build"
          value={buildVersion}
          chevron={false}
        />
        <RowSeparator />
        <AccountRow
          icon="server-outline"
          iconColor={colors.textMuted}
          label="Ambiente"
          value={environment}
          chevron={false}
        />
      </AccountSection>

      <AccountSection title="Sobre">
        <AccountRow
          icon="apps-outline"
          iconColor={colors.primary}
          label="Versão"
          value={appVersion}
          chevron={false}
        />
        <RowSeparator />
        <AccountRow
          icon="code-slash-outline"
          iconColor={colors.textMuted}
          label="Licenças Open Source"
          onPress={() => alert("Licenças", "Bibliotecas open source serão listadas aqui em breve.")}
        />
        <RowSeparator />
        <AccountRow
          icon="people-outline"
          iconColor={colors.textMuted}
          label="Créditos"
          onPress={() => alert("Créditos", "Finance Mobile © 2025")}
        />
        <RowSeparator />
        <AccountRow
          icon="globe-outline"
          iconColor={colors.info}
          label="Site oficial"
          onPress={() => Linking.openURL("https://finance.app")}
        />
      </AccountSection>
      {dialog}
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    heroCard: {
      alignItems: "center",
      paddingVertical: spacing["2xl"],
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    heroTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    heroText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: spacing.lg,
    },
  });
}
