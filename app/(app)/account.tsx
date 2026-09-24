import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { EditModal } from "@/components/account/edit-modal";
import { RowSeparator } from "@/components/account/row-separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/hooks/use-app-dialog";
import {
    changePassword,
    confirmEmailChange,
    requestEmailChange,
    updateProfile,
} from "@/lib/account-service";
import { getStoredUserName, setStoredUserName } from "@/lib/auth";
import { getMe } from "@/lib/backend";
import { backupThenSignOut, signOutAndClearLocalData } from "@/lib/local-data";
import { deleteProfilePhoto, getProfilePhotoUri, onProfilePhotoChange, saveProfilePhoto } from "@/lib/profile-photo";
import { getSubscriptionStatus } from "@/lib/subscription";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { SubscriptionStatus } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface UserInfo {
  name: string | null;
  email: string;
}

type ModalType = "name" | "password" | "email" | null;

export default function AccountScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEmailPassword, setEditEmailPassword] = useState("");
  const [emailStep, setEmailStep] = useState<"form" | "code">("form");
  const [emailCode, setEmailCode] = useState("");
  const [emailChangeMessage, setEmailChangeMessage] = useState("");
  const [editCurrentPassword, setEditCurrentPassword] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const { alert, confirm, dialog } = useAppDialog();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const cachedName = await getStoredUserName();
          if (cachedName && active) {
            setUser((prev) => prev ? { ...prev, name: cachedName } : { name: cachedName, email: "" });
          }
          const me = await getMe();
          if (active) {
            setUser({ name: me.name, email: me.email });
            setEmailVerified(me.emailVerified ?? false);
          }
          const photo = await getProfilePhotoUri();
          if (active) setPhotoUri(photo);
          const sub = await getSubscriptionStatus();
          if (active) setSubscription(sub);
        } catch {
          // offline
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  useEffect(() => {
    return onProfilePhotoChange((uri) => setPhotoUri(uri));
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  const handlePickPhoto = async () => {
    try {
      setPhotoLoading(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alert("Permissão necessária", "Permita o acesso à galeria para alterar sua foto de perfil.", { variant: "warning" });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const uri = await saveProfilePhoto(asset.uri, asset.base64 ?? undefined);
      setPhotoUri(uri);
    } catch {
      alert("Erro", "Não foi possível salvar a foto", { variant: "danger" });
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleRemovePhoto = () => {
    confirm("Remover foto", "Deseja remover sua foto de perfil?", {
      variant: "danger",
      confirmText: "Remover",
      onConfirm: async () => {
        await deleteProfilePhoto();
        setPhotoUri(null);
      },
    });
  };

  const handleLogout = () => {
    const signOut = async (action: () => Promise<void>) => {
      try {
        await action();
        router.replace("/" as any);
      } catch (err) {
        alert("Não foi possível sair", err instanceof Error ? err.message : "Erro ao sair da conta", {
          variant: "danger",
        });
      }
    };

    confirm(
      "Sair da conta",
      "Ao sair, os dados financeiros deste aparelho serão apagados. Faça um backup na nuvem para recuperá-los quando entrar novamente.",
      {
        variant: "warning",
        confirmText: "Backup e sair",
        onConfirm: () => signOut(backupThenSignOut),
        secondaryText: "Sair sem backup",
        onSecondary: () => signOut(signOutAndClearLocalData),
      }
    );
  };

  const openModal = (type: ModalType) => {
    if (type === "name") setEditName(user?.name ?? "");
    if (type === "email") {
      setEditEmail(user?.email ?? "");
      setEditEmailPassword("");
      setEmailCode("");
      setEmailStep("form");
    }
    if (type === "password") {
      setEditCurrentPassword("");
      setEditNewPassword("");
      setEditConfirmPassword("");
    }
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalLoading(false);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    try {
      setModalLoading(true);
      try {
        const updated = await updateProfile({ name: editName.trim() });
        setUser((prev) => prev ? { ...prev, name: updated.name } : null);
      } catch {
        // Backend failed — save locally as fallback
        await setStoredUserName(editName.trim());
        setUser((prev) => prev ? { ...prev, name: editName.trim() } : null);
      }
      closeModal();
      alert("Sucesso", "Nome atualizado com sucesso", { variant: "success" });
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao atualizar nome", { variant: "danger" });
    } finally {
      setModalLoading(false);
    }
  };

  // Troca de e-mail em duas etapas: senha + novo e-mail → código enviado ao novo endereço
  const handleSaveEmail = async () => {
    const newEmail = editEmail.trim().toLowerCase();
    if (!newEmail || !newEmail.includes("@")) {
      alert("Erro", "Digite um e-mail válido", { variant: "danger" });
      return;
    }
    if (newEmail === user?.email) {
      alert("Erro", "Esse já é o seu e-mail atual", { variant: "danger" });
      return;
    }
    if (!editEmailPassword) {
      alert("Erro", "Digite sua senha atual", { variant: "danger" });
      return;
    }
    try {
      setModalLoading(true);
      const { message } = await requestEmailChange(newEmail, editEmailPassword);
      setEmailChangeMessage(message);
      setEditEmailPassword("");
      setEmailCode("");
      setEmailStep("code");
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao solicitar troca de e-mail", { variant: "danger" });
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmEmail = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) {
      alert("Erro", "Digite o código de 6 dígitos", { variant: "danger" });
      return;
    }
    try {
      setModalLoading(true);
      const updated = await confirmEmailChange(emailCode.trim());
      setUser((prev) => prev ? { ...prev, email: updated.email } : null);
      closeModal();
      alert("Sucesso", "E-mail alterado com sucesso", { variant: "success" });
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao confirmar e-mail", { variant: "danger" });
    } finally {
      setModalLoading(false);
    }
  };

  const handleSavePassword = async () => {
    if (!editCurrentPassword || !editNewPassword || !editConfirmPassword) {
      alert("Erro", "Preencha todos os campos", { variant: "danger" });
      return;
    }
    // Mesma regra do backend
    if (editNewPassword.length < 8 || !/[a-zA-Z]/.test(editNewPassword) || !/\d/.test(editNewPassword)) {
      alert("Erro", "A nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número", { variant: "danger" });
      return;
    }
    if (editNewPassword !== editConfirmPassword) {
      alert("Erro", "As senhas não coincidem", { variant: "danger" });
      return;
    }
    try {
      setModalLoading(true);
      await changePassword({
        currentPassword: editCurrentPassword,
        newPassword: editNewPassword,
      });
      closeModal();
      alert("Sucesso", "Senha alterada com sucesso", { variant: "success" });
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Erro ao alterar senha", { variant: "danger" });
    } finally {
      setModalLoading(false);
    }
  };

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildVersion = String(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1");

  const isPro = subscription?.plan.code === "PRO";

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Minha Conta</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ══════════ PERFIL ══════════ */}
          <View style={styles.profileCard}>
            <Pressable onPress={handlePickPhoto} disabled={photoLoading}>
              {photoUri ? (
                <View style={styles.avatar}>
                  <Image source={{ uri: photoUri }} style={styles.avatarImage} />
                  <View style={styles.avatarEditBadge}>
                    {photoLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={16} color="#fff" />
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                  <View style={styles.avatarEditBadge}>
                    {photoLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={16} color="#fff" />
                    )}
                  </View>
                </View>
              )}
            </Pressable>
            {photoUri && (
              <TouchableOpacity onPress={handleRemovePhoto} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removePhotoText}>Remover foto</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.profileName}>{user?.name || "Usuário"}</Text>
            {user?.email ? <Text style={styles.profileEmail}>{user.email}</Text> : null}
            <View style={[styles.badge, emailVerified ? styles.badgeSuccess : styles.badgeWarning]}>
              <Ionicons name={emailVerified ? "checkmark-circle" : "alert-circle"} size={12} color={emailVerified ? colors.success : colors.warning} />
              <Text style={[styles.badgeText, { color: emailVerified ? colors.success : colors.warning }]}>
                {emailVerified ? "E-mail verificado" : "E-mail não verificado"}
              </Text>
            </View>
          </View>

          {/* ══════════ EDITAR PERFIL ══════════ */}
          <AccountSection title="Editar Perfil">
            <AccountRow
              icon="camera-outline"
              iconColor={colors.primary}
              label="Alterar foto de perfil"
              onPress={handlePickPhoto}
            />
            <RowSeparator />
            <AccountRow
              icon="person-outline"
              iconColor={colors.primary}
              label="Alterar nome"
              value={user?.name ?? "—"}
              onPress={() => openModal("name")}
            />
            <RowSeparator />
            <AccountRow
              icon="mail-outline"
              iconColor={colors.info}
              label="Alterar e-mail"
              value={user?.email ?? "—"}
              onPress={() => openModal("email")}
            />
            <RowSeparator />
            <AccountRow
              icon="lock-closed-outline"
              iconColor={colors.warning}
              label="Alterar senha"
              onPress={() => openModal("password")}
            />
            <RowSeparator />
            <AccountRow
              icon="shield-checkmark-outline"
              iconColor={emailVerified ? colors.success : colors.warning}
              label="Status do e-mail"
              value={emailVerified ? "Verificado" : "Não verificado"}
              chevron={false}
            />
          </AccountSection>

          {/* ══════════ ASSINATURA ══════════ */}
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <View style={[styles.subscriptionIcon, { backgroundColor: (isPro ? colors.warning : colors.primary) + "22" }]}>
                <Ionicons name="diamond" size={22} color={isPro ? colors.warning : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subscriptionPlan}>
                  {subscription?.plan.name ?? "Grátis"}
                </Text>
                <Text style={styles.subscriptionStatus}>
                  {isPro ? "Assinatura ativa" : "Plano gratuito"}
                </Text>
              </View>
            </View>

            {isPro && (
              <View style={styles.subscriptionDetails}>
                <View style={styles.subscriptionRow}>
                  <Text style={styles.subscriptionLabel}>Status</Text>
                  <Text style={styles.subscriptionValue}>Ativo</Text>
                </View>
                <View style={styles.subscriptionRow}>
                  <Text style={styles.subscriptionLabel}>Próxima cobrança</Text>
                  <Text style={styles.subscriptionValue}>
                    {subscription?.usage.resetsAt
                      ? new Date(subscription.usage.resetsAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </Text>
                </View>
                <View style={styles.subscriptionRow}>
                  <Text style={styles.subscriptionLabel}>Tokens usados</Text>
                  <Text style={styles.subscriptionValue}>
                    {subscription?.usage.used.toLocaleString("pt-BR")} / {subscription?.usage.limit.toLocaleString("pt-BR")}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.benefitsList}>
              <Text style={styles.benefitsTitle}>
                {isPro ? "Benefícios do seu plano" : "Benefícios do Premium"}
              </Text>
              {(isPro
                ? ["IA ilimitada", "Importação avançada", "Backup automático", "Suporte prioritário"]
                : ["IA com limite mensal", "Importação básica", "Backup manual", "Suporte comunitário"]
              ).map((benefit) => (
                <View key={benefit} style={styles.benefitItem}>
                  <Ionicons name={isPro ? "checkmark-circle" : "ellipse-outline"} size={16} color={isPro ? colors.success : colors.textMuted} />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>

            <Button
              title={isPro ? "Gerenciar assinatura" : "Fazer Upgrade"}
              onPress={() => router.push("/billing" as any)}
              variant={isPro ? "secondary" : "primary"}
            />
          </View>

          {/* ══════════ SAIR ══════════ */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>

          <Text style={styles.versionFooter}>Finance Mobile v{appVersion} ({buildVersion})</Text>
        </ScrollView>
      )}

      {/* ══════════ MODAIS DE EDIÇÃO ══════════ */}
      <EditModal
        visible={activeModal === "name"}
        title="Alterar nome"
        onClose={closeModal}
        footer={
          <>
            <Button title="Salvar" onPress={handleSaveName} loading={modalLoading} />
            <Button title="Cancelar" onPress={closeModal} variant="ghost" />
          </>
        }
      >
        <Input label="Nome completo" value={editName} onChangeText={setEditName} placeholder="Seu nome" autoCapitalize="words" />
      </EditModal>

      <EditModal
        visible={activeModal === "email"}
        title={emailStep === "form" ? "Alterar e-mail" : "Confirmar novo e-mail"}
        onClose={closeModal}
        footer={
          <>
            {emailStep === "form" ? (
              <Button title="Enviar código" onPress={handleSaveEmail} loading={modalLoading} />
            ) : (
              <Button title="Confirmar" onPress={handleConfirmEmail} loading={modalLoading} />
            )}
            <Button title="Cancelar" onPress={closeModal} variant="ghost" />
          </>
        }
      >
        {emailStep === "form" ? (
          <>
            <Input label="Novo e-mail" value={editEmail} onChangeText={setEditEmail} placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Input label="Senha atual" value={editEmailPassword} onChangeText={setEditEmailPassword} secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            <Text style={styles.modalHint}>
              Enviaremos um código de confirmação para o novo e-mail. Sua conta só muda depois que você digitar o código.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.modalHint}>{emailChangeMessage}</Text>
            <Input
              label="Código de 6 dígitos"
              value={emailCode}
              onChangeText={(text) => setEmailCode(text.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </>
        )}
      </EditModal>

      <EditModal
        visible={activeModal === "password"}
        title="Alterar senha"
        onClose={closeModal}
        footer={
          <>
            <Button title="Alterar senha" onPress={handleSavePassword} loading={modalLoading} />
            <Button title="Cancelar" onPress={closeModal} variant="ghost" />
          </>
        }
      >
        <Input label="Senha atual" value={editCurrentPassword} onChangeText={setEditCurrentPassword} secureTextEntry placeholder="••••••••" />
        <Input label="Nova senha" value={editNewPassword} onChangeText={setEditNewPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />
        <Input label="Confirmar nova senha" value={editConfirmPassword} onChangeText={setEditConfirmPassword} secureTextEntry placeholder="••••••••" />
      </EditModal>
      {dialog}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + "33",
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  removePhotoText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textMuted,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  badgeSuccess: {
    backgroundColor: colors.success + "1a",
  },
  badgeWarning: {
    backgroundColor: colors.warning + "1a",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  subscriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  subscriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  subscriptionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionPlan: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subscriptionStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  subscriptionDetails: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  subscriptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  subscriptionLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  subscriptionValue: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  benefitsList: {
    gap: 6,
  },
  benefitsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  benefitText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary + "12",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.danger + "18",
    borderWidth: 1,
    borderColor: colors.danger + "44",
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.danger,
  },
  versionFooter: {
    textAlign: "center",
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing["3xl"],
  },
  modalHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
});
}
