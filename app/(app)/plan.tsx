import { Button } from "@/components/ui/button";
import { isAuthenticated, login, logout, register } from "@/lib/auth";
// TODO: Reativar IAP quando Google Play Billing estiver configurado
// import { closeIAP, initIAP, requestProSubscription, startPurchaseListener } from "@/lib/iap";
import { getSubscriptionStatus } from "@/lib/subscription";
import { colors, radius, spacing } from "@/lib/theme";
import type { SubscriptionStatus } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PlanScreen() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth modal
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const authed = await isAuthenticated();
      setLoggedIn(authed);
      if (authed) {
        const s = await getSubscriptionStatus();
        setStatus(s);
      } else {
        setStatus(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );


  const onRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert("Erro", "Preencha todos os campos");
      return;
    }
    if (isRegister && !authName.trim()) {
      Alert.alert("Erro", "Preencha seu nome");
      return;
    }
    setAuthLoading(true);
    try {
      if (isRegister) {
        await register(authName.trim(), authEmail.trim(), authPassword.trim());
      } else {
        await login(authEmail.trim(), authPassword.trim());
      }
      setLoggedIn(true);
      setShowAuthModal(false);
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      fetchStatus();
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLoggedIn(false);
    setStatus(null);
  };

  const handleUpgrade = async () => {
    Alert.alert("Em breve", "Assinaturas serão disponibilizadas em breve pelo Google Play.");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const usagePercent = status ? Math.min(100, Math.round((status.usage.used / status.usage.limit) * 100)) : 0;
  const isPro = status?.plan.code === "PRO";
  const resetDate = status?.usage.resetsAt
    ? new Date(status.usage.resetsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View>
          <Text style={styles.title}>Meu Plano</Text>
          <Text style={styles.subtitle}>Gerencie sua assinatura e uso de IA</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loggedIn ? (
          <View style={styles.card}>
            <Ionicons name="person-circle-outline" size={48} color={colors.textMuted} />
            <Text style={styles.cardTitle}>Faça login ou crie sua conta</Text>
            <Text style={styles.cardText}>
              Para usar a IA e ver seu plano, entre com sua conta ou crie uma nova.
            </Text>
            <View style={{ gap: spacing.sm, width: "100%" }}>
              <Button
                title="Entrar"
                onPress={() => {
                  setIsRegister(false);
                  setShowAuthModal(true);
                }}
              />
              <Button
                title="Criar conta"
                variant="secondary"
                onPress={() => {
                  setIsRegister(true);
                  setShowAuthModal(true);
                }}
              />
            </View>
          </View>
        ) : (
          <>
            {/* Plan card */}
            <View style={[styles.planCard, isPro && styles.planCardPro]}>
              <View style={styles.planHeader}>
                <Ionicons
                  name={isPro ? "diamond" : "leaf-outline"}
                  size={24}
                  color={isPro ? "#fbbf24" : colors.primaryLight}
                />
                <Text style={styles.planName}>{status?.plan.name ?? "Grátis"}</Text>
              </View>
              <Text style={styles.planLimit}>
                {status?.plan.tokenLimit.toLocaleString("pt-BR")} tokens/mês
              </Text>
            </View>

            {/* Usage */}
            {status && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Uso mensal</Text>

                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${usagePercent}%`,
                        backgroundColor: usagePercent > 90 ? colors.danger : usagePercent > 70 ? colors.warning : colors.primary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.usageRow}>
                  <Text style={styles.usageText}>
                    {status.usage.used.toLocaleString("pt-BR")} / {status.usage.limit.toLocaleString("pt-BR")}
                  </Text>
                  <Text style={styles.usagePercent}>{usagePercent}%</Text>
                </View>

                <Text style={styles.resetText}>
                  Restam {status.usage.remaining.toLocaleString("pt-BR")} tokens. Renova em {resetDate}.
                </Text>
              </View>
            )}

            {/* Upgrade */}
            {!isPro && (
              <View style={[styles.card, { borderColor: colors.primary, borderWidth: 1.5 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Ionicons name="diamond" size={22} color="#fbbf24" />
                  <Text style={styles.cardTitle}>Upgrade para Pro</Text>
                </View>
                <Text style={styles.cardText}>
                  Receba 250.000 tokens/mês para usar IA, OCR, áudio e texto com prioridade.
                </Text>
                <Text style={[styles.cardText, { fontWeight: "700", color: colors.primary, fontSize: 20 }]}>
                  R$ 19,90/mês
                </Text>
                <Button title="Fazer upgrade" onPress={handleUpgrade} />
              </View>
            )}

            {/* Logout */}
            <Button title="Sair da conta" variant="ghost" onPress={handleLogout} />
          </>
        )}
      </ScrollView>

      {/* Auth Modal */}
      <Modal visible={showAuthModal} animationType="slide" onRequestClose={() => setShowAuthModal(false)}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAuthModal(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{isRegister ? "Criar conta" : "Login"}</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {isRegister && (
              <>
                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput
                  style={styles.modalInput}
                  value={authName}
                  onChangeText={setAuthName}
                  placeholder="Seu nome"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </>
            )}
            <Text style={styles.modalLabel}>E-mail</Text>
            <TextInput
              style={styles.modalInput}
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="seu@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text style={styles.modalLabel}>Senha</Text>
            <TextInput
              style={styles.modalInput}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder={isRegister ? "Mínimo 6 caracteres" : "Sua senha"}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title={isRegister ? "Criar conta" : "Entrar"}
              onPress={handleAuth}
              loading={authLoading}
            />
            <Pressable
              onPress={() => setIsRegister(!isRegister)}
              style={{ alignItems: "center", paddingVertical: spacing.md }}
            >
              <Text style={{ color: colors.primary, fontSize: 14 }}>
                {isRegister ? "Já tem conta? Entrar" : "Não tem conta? Criar"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    fontSize: 13,
    color: colors.danger,
    backgroundColor: "#fee2e2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  cardText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, alignSelf: "flex-start" },
  planCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  planCardPro: { backgroundColor: "#7c3aed" },
  planHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  planName: { fontSize: 20, fontWeight: "700", color: colors.textInverse },
  planLimit: { fontSize: 14, color: colors.primaryLight },
  barBg: {
    width: "100%",
    height: 10,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: radius.full },
  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  usageText: { fontSize: 13, color: colors.textSecondary },
  usagePercent: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  resetText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  modalContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  modalLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
});
