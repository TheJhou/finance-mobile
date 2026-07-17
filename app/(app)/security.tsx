import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { EditModal } from "@/components/account/edit-modal";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { ToggleRow } from "@/components/account/toggle-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { changePassword } from "@/lib/account-service";
import { authenticateWithBiometrics, getBiometricTypeName, isBiometricAvailable, isBiometricEnabled, setBiometricEnabled } from "@/lib/biometric";
import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function SecurityScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricTypeName, setBiometricTypeName] = useState("Biometria");
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [activeModal, setActiveModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { alert, dialog } = useAppDialog();

  useEffect(() => {
    (async () => {
      const avail = await isBiometricAvailable();
      setBiometricAvailable(avail.available);
      setBiometricTypeName(getBiometricTypeName(avail.biometricType));
      const enabled = await isBiometricEnabled();
      setBiometricEnabledState(enabled);
    })();
  }, []);

  const handleBiometricToggle = async () => {
    if (!biometricEnabled) {
      const result = await authenticateWithBiometrics(`Ative ${biometricTypeName} para acessar o app`);
      if (result.success) {
        await setBiometricEnabled(true);
        setBiometricEnabledState(true);
        alert("Sucesso", `${biometricTypeName} ativada com sucesso`, { variant: "success" });
      } else {
        alert("Erro", result.error ?? "Falha na autenticação", { variant: "danger" });
      }
    } else {
      await setBiometricEnabled(false);
      setBiometricEnabledState(false);
      alert("Desativado", `${biometricTypeName} desativada`, { variant: "warning" });
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Erro", "Preencha todos os campos", { variant: "danger" });
      return;
    }
    if (newPassword.length < 6) {
      alert("Erro", "A nova senha deve ter no mínimo 6 caracteres", { variant: "danger" });
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Erro", "As senhas não coincidem", { variant: "danger" });
      return;
    }
    try {
      setModalLoading(true);
      await changePassword({ currentPassword, newPassword });
      setActiveModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Sucesso", "Senha alterada com sucesso", { variant: "success" });
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao alterar senha", { variant: "danger" });
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <ScreenLayout title="Segurança">
      <AccountSection title="Biometria">
        {!biometricAvailable ? (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={20} color={colors.warning} />
            <Text style={styles.warningText}>
              {biometricTypeName} não disponível neste dispositivo. Cadastre sua digital nas configurações do celular para ativar.
            </Text>
          </View>
        ) : (
          <ToggleRow
            icon="finger-print-outline"
            iconColor={colors.primary}
            label={`Usar ${biometricTypeName}`}
            subtitle="Exigir autenticação ao abrir o app"
            value={biometricEnabled}
            onToggle={handleBiometricToggle}
          />
        )}
      </AccountSection>

      <AccountSection title="Senha">
        <AccountRow
          icon="key-outline"
          iconColor={colors.warning}
          label="Alterar senha"
          onPress={() => setActiveModal(true)}
        />
      </AccountSection>

      <AccountSection title="Sessões">
        <AccountRow
          icon="phone-portrait-outline"
          iconColor={colors.primary}
          label="Sessões ativas"
          subtitle="Gerencie dispositivos conectados"
          onPress={() => alert("Sessões", "Funcionalidade em desenvolvimento")}
        />
        <RowSeparator />
        <AccountRow
          icon="close-circle-outline"
          iconColor={colors.danger}
          label="Encerrar todas as sessões"
          onPress={() => alert("Encerrar sessões", "Funcionalidade em desenvolvimento")}
        />
        <RowSeparator />
        <AccountRow
          icon="hardware-chip-outline"
          iconColor={colors.info}
          label="Dispositivos conectados"
          onPress={() => alert("Dispositivos", "Funcionalidade em desenvolvimento")}
        />
      </AccountSection>

      <EditModal
        visible={activeModal}
        title="Alterar senha"
        onClose={() => { setActiveModal(false); setModalLoading(false); }}
        footer={
          <>
            <Button title="Alterar senha" onPress={handleSavePassword} loading={modalLoading} />
            <Button title="Cancelar" onPress={() => setActiveModal(false)} variant="ghost" />
          </>
        }
      >
        <Input label="Senha atual" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="••••••••" />
        <Input label="Nova senha" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />
        <Input label="Confirmar nova senha" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" />
      </EditModal>
      {dialog}
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    warningBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.warning + "1a",
      borderRadius: 10,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });
}
