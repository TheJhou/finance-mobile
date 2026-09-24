import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { EditModal } from "@/components/account/edit-modal";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { deleteAccount, exportAccountData } from "@/lib/account-service";
import { logout } from "@/lib/auth";
import { clearLocalUserData } from "@/lib/local-data";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function DataPrivacyScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { alert, dialog } = useAppDialog();

  const openDeleteModal = () => {
    setDeletePassword("");
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalVisible(false);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError("Digite sua senha para confirmar");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      // Conta não foi excluída (ex.: senha incorreta) — nada local é apagado
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir conta");
      setDeleting(false);
      return;
    }

    // A conta já não existe no servidor: segue com a limpeza local mesmo se algo falhar
    try {
      await clearLocalUserData();
    } catch (err) {
      console.error("[DataPrivacy] Falha ao apagar dados locais após excluir conta:", err);
    }
    await logout();
    setDeleting(false);
    setDeleteModalVisible(false);
    alert("Conta excluída", "Sua conta e os dados deste aparelho foram excluídos.", {
      variant: "success",
      onConfirm: () => router.replace("/" as any),
      onCancel: () => router.replace("/" as any),
    });
  };

  const handleExportLgpd = async () => {
    try {
      setExporting(true);
      const blob = await exportAccountData();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const file = new File(Paths.cache, `lgpd-export-${Date.now()}.json`);
      file.write(atob(base64));
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Exportação de dados (LGPD)",
      });
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao exportar dados", { variant: "danger" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenLayout title="Dados e Privacidade">
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
        <Text style={styles.infoTitle}>Seus dados estão seguros</Text>
        <Text style={styles.infoText}>
          Levamos sua privacidade a sério. Seus dados são criptografados e tratados em conformidade com a LGPD (Lei nº 13.709/2018).
        </Text>
      </View>

      <AccountSection title="Exportar Dados">
        <AccountRow
          icon="download-outline"
          iconColor={colors.info}
          label="Exportar relatórios"
          onPress={() => router.push("/export-data" as any)}
        />
        <RowSeparator />
        <AccountRow
          icon="document-text-outline"
          iconColor={colors.info}
          label="Baixar todos os meus dados (LGPD)"
          subtitle="Exportação completa conforme Art. 18 da LGPD"
          onPress={handleExportLgpd}
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
          label="Excluir conta e todos os dados"
          subtitle="Exclusão permanente e irreversível (direito ao esquecimento)"
          danger
          onPress={openDeleteModal}
        />
      </AccountSection>

      <EditModal
        visible={deleteModalVisible}
        title="Excluir conta"
        onClose={closeDeleteModal}
        footer={
          <>
            <Button title="Excluir definitivamente" variant="danger" onPress={handleDeleteAccount} loading={deleting} />
            <Button title="Cancelar" variant="ghost" onPress={closeDeleteModal} disabled={deleting} />
          </>
        }
      >
        <Text style={styles.deleteWarning}>
          Esta ação é irreversível. Sua conta, seus backups na nuvem e todos os dados deste aparelho serão excluídos permanentemente.
        </Text>
        <Input
          label="Confirme sua senha"
          value={deletePassword}
          onChangeText={(text) => {
            setDeletePassword(text);
            if (deleteError) setDeleteError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!deleting}
          error={deleteError ?? undefined}
        />
      </EditModal>

      {exporting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Exportando dados...</Text>
        </View>
      )}
      {dialog}
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
    deleteWarning: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    loadingText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
