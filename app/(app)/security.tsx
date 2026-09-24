import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { EditModal } from "@/components/account/edit-modal";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { ToggleRow } from "@/components/account/toggle-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { changePassword, getSessions, revokeAllSessions, revokeSession, type SessionInfo } from "@/lib/account-service";
import { logout } from "@/lib/auth";
import { authenticateWithBiometrics, getBiometricTypeName, isBiometricAvailable, isBiometricEnabled, setBiometricEnabled } from "@/lib/biometric";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

function formatLastActive(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SecurityScreen() {
  const styles = useThemedStyles(createStyles);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricTypeName, setBiometricTypeName] = useState("Biometria");
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [activeModal, setActiveModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { alert, confirm, dialog } = useAppDialog();
  const router = useRouter();

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
    // Mesma regra do backend
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      alert("Erro", "A nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número", { variant: "danger" });
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

  const openSessions = async () => {
    setSessionsVisible(true);
    setSessionsLoading(true);
    try {
      setSessions(await getSessions());
    } catch (err) {
      setSessionsVisible(false);
      alert("Erro", err instanceof Error ? err.message : "Erro ao carregar sessões", { variant: "danger" });
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRevokeOne = async (session: SessionInfo) => {
    setRevokingId(session.id);
    try {
      await revokeSession(session.id);
      setSessions((current) => current.filter((s) => s.id !== session.id));
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao encerrar sessão", { variant: "danger" });
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = () => {
    confirm(
      "Encerrar todas as sessões",
      "Todos os aparelhos serão desconectados, inclusive este. Seus dados neste aparelho são mantidos e você precisará entrar novamente.",
      {
        variant: "danger",
        confirmText: "Encerrar",
        onConfirm: async () => {
          try {
            await revokeAllSessions();
          } catch (err) {
            alert("Erro", err instanceof Error ? err.message : "Erro ao encerrar sessões", { variant: "danger" });
            return;
          }
          // Mesma conta vai entrar de novo: encerra só a sessão local, sem apagar dados
          await logout();
          router.replace("/" as any);
        },
      }
    );
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
          subtitle="Aparelhos conectados à sua conta"
          onPress={openSessions}
        />
        <RowSeparator />
        <AccountRow
          icon="close-circle-outline"
          iconColor={colors.danger}
          label="Encerrar todas as sessões"
          subtitle="Inclusive neste aparelho"
          onPress={handleRevokeAll}
        />
      </AccountSection>

      <EditModal visible={sessionsVisible} title="Sessões ativas" onClose={() => setSessionsVisible(false)}>
        {sessionsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : sessions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma sessão ativa encontrada.</Text>
        ) : (
          sessions.map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <Ionicons
                name={session.platform === "ios" ? "logo-apple" : "phone-portrait-outline"}
                size={22}
                color={colors.primary}
              />
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionName}>
                  {session.device}
                  {session.current ? <Text style={styles.currentTag}>  · Este aparelho</Text> : null}
                </Text>
                <Text style={styles.sessionMeta}>Último uso: {formatLastActive(session.lastActive)}</Text>
              </View>
              {!session.current ? (
                <Pressable onPress={() => handleRevokeOne(session)} disabled={revokingId === session.id} hitSlop={8}>
                  {revokingId === session.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text style={styles.revokeText}>Encerrar</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </EditModal>

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
        <Input label="Nova senha" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Mínimo 8 caracteres, com letra e número" />
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
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
    },
    sessionInfo: {
      flex: 1,
      gap: 2,
    },
    sessionName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    currentTag: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.success,
    },
    sessionMeta: {
      fontSize: 12,
      color: colors.textMuted,
    },
    revokeText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.danger,
    },
  });
}
