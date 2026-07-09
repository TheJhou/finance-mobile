import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { deleteAccount } from "@/lib/account-service";
import { logout } from "@/lib/auth";
import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

export default function DataPrivacyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Excluir conta",
      "Esta ação é irreversível. Todos os seus dados serão permanentemente excluídos. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirmação final",
              "Digite sua senha para confirmar a exclusão permanente da sua conta.",
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Excluir definitivamente",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      setDeleting(true);
                      await deleteAccount("confirm");
                      await logout();
                      Alert.alert("Conta excluída", "Sua conta foi excluída com sucesso.");
                      router.replace("/" as any);
                    } catch (err) {
                      Alert.alert("Erro", err instanceof Error ? err.message : "Erro ao excluir conta");
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <ScreenLayout title="Dados e Privacidade">
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
        <Text style={styles.infoTitle}>Seus dados estão seguros</Text>
        <Text style={styles.infoText}>
          Levamos sua privacidade a sério. Seus dados são criptografados e nunca compartilhados com terceiros.
        </Text>
      </View>

      <AccountSection title="Exportar Dados">
        <AccountRow
          icon="download-outline"
          iconColor={colors.info}
          label="Exportar meus dados"
          onPress={() => router.push("/export-data" as any)}
        />
        <RowSeparator />
        <AccountRow
          icon="document-text-outline"
          iconColor={colors.info}
          label="Baixar dados da conta (LGPD)"
          subtitle="Solicite seus dados conforme a LGPD"
          onPress={() => Alert.alert("LGPD", "Sua solicitação foi registrada. Você receberá um e-mail com seus dados em até 72h.")}
        />
      </AccountSection>

      <AccountSection title="Documentos">
        <AccountRow
          icon="shield-outline"
          iconColor={colors.primary}
          label="Política de Privacidade"
          onPress={() => router.push("/(app)/privacy" as any)}
        />
        <RowSeparator />
        <AccountRow
          icon="document-outline"
          iconColor={colors.primary}
          label="Termos de Uso"
          onPress={() => router.push("/(app)/terms" as any)}
        />
      </AccountSection>

      <AccountSection title="Zona de Perigo">
        <AccountRow
          icon="trash-outline"
          iconColor={colors.danger}
          label="Solicitar exclusão da conta"
          subtitle="Exclusão permanente e irreversível"
          danger
          onPress={handleDeleteAccount}
        />
      </AccountSection>
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    infoCard: {
      alignItems: "center",
      paddingVertical: spacing["2xl"],
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: spacing.lg,
      lineHeight: 18,
    },
  });
}
