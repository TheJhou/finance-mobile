import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { isAuthenticated, login, register } from "@/lib/auth";
import { onPurchaseEvent, requestProSubscription } from "@/lib/iap";
import { clearProCache, getSubscriptionStatus } from "@/lib/subscription";
import { PLANS, PLAY_STORE_TEXTS, formatPrice, getTokenDisplayText } from "@/lib/subscription-plans";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { handleTokenLimitError, resetTokenLimitStatus } from "@/lib/token-limit";
import type { SubscriptionStatus } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
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
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
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
  const [purchasing, setPurchasing] = useState(false);
  const { alert, dialog } = useAppDialog();

  const fetchStatus = useCallback(async () => {
    clearProCache();
    try {
      const authed = await isAuthenticated();
      setLoggedIn(authed);
      if (authed) {
        const s = await getSubscriptionStatus();
        setStatus(s);
        setError(null); // Clear any previous errors
      } else {
        setStatus(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar";
      if (msg.toLowerCase().includes("sessão expirada") || msg.toLowerCase().includes("faça login")) {
        setLoggedIn(false);
        setStatus(null);
      } else if (handleTokenLimitError(err)) {
        setError("Limite de tokens atingido. Veja seu plano atual.");
      } else {
        setError(msg);
        console.error("[Plan] Error fetching subscription status:", err);
      }
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
    resetTokenLimitStatus();
    fetchStatus();
  };

  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      alert("Erro", "Preencha todos os campos", { variant: "danger" });
      return;
    }
    if (isRegister && !authName.trim()) {
      alert("Erro", "Preencha seu nome", { variant: "danger" });
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
      clearProCache();
      fetchStatus();
    } catch (err) {
      alert("Erro", err instanceof Error ? err.message : "Falha na autenticação", { variant: "danger" });
    } finally {
      setAuthLoading(false);
    }
  };

  // A compra é validada globalmente (lib/iap → startGlobalPurchaseHandling);
  // aqui só exibimos o resultado.
  useEffect(() => {
    return onPurchaseEvent((event) => {
      setPurchasing(false);
      switch (event.type) {
        case "activated":
          alert("Sucesso!", "Assinatura PRO ativada com sucesso!", { variant: "success" });
          fetchStatus();
          break;
        case "pending":
          alert(
            "Pagamento pendente",
            "Sua assinatura será ativada automaticamente assim que o pagamento for confirmado pela Google Play.",
            { variant: "warning" }
          );
          break;
        case "error":
          alert("Erro na compra", event.message, { variant: "danger" });
          break;
        case "cancelled":
          break;
      }
    });
  }, [alert, fetchStatus]);

  const handleUpgrade = async () => {
    try {
      setPurchasing(true);
      await requestProSubscription();
    } catch (err) {
      setPurchasing(false);
      const msg = err instanceof Error ? err.message : "Erro ao iniciar compra";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) {
        alert("Erro", msg, { variant: "danger" });
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
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
  const usageBarColor = getUsageBarColor(usagePercent);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View>
          <Text style={styles.title}>Meu Plano</Text>
          <Text style={styles.subtitle}>Gerencie sua assinatura e uso de IA</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Show fallback indicator when API is unavailable but we have default data */}
        {status && !error && status.plan.code === "FREE" && status.usage.used === 0 && (
          <View style={styles.fallbackCard}>
            <Ionicons name="information-circle" size={16} color={colors.textMuted} />
            <Text style={styles.fallbackText}>
              Usando dados offline. Conecte-se à internet para ver seu plano atual.
            </Text>
          </View>
        )}

        {loggedIn ? (
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
                        backgroundColor: usageBarColor,
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
              <View style={[styles.card, { borderColor: PLANS.PRO.color, borderWidth: 1.5 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Ionicons name="diamond" size={22} color={PLANS.PRO.color} />
                  <Text style={styles.cardTitle}>{PLAY_STORE_TEXTS.subscriptionTitle}</Text>
                </View>
                <Text style={styles.cardText}>
                  {PLAY_STORE_TEXTS.subscriptionDescription}
                </Text>
                <Text style={[styles.cardText, { fontWeight: "700", color: PLANS.PRO.color, fontSize: 20 }]}>
                  {formatPrice(PLANS.PRO.price)}/mês
                </Text>
                <Text style={styles.cardText}>
                  {getTokenDisplayText(PLANS.PRO.tokenLimit)} tokens/mês • IA ilimitada
                </Text>
                <Button title="Assinar agora" onPress={handleUpgrade} loading={purchasing} />
                <Text style={styles.cardTextSmall}>
                  {PLAY_STORE_TEXTS.autoRenewing}
                </Text>
              </View>
            )}
          </>
        ) : (
          <AuthPromptCard
            onLoginPress={() => {
              setIsRegister(false);
              setShowAuthModal(true);
            }}
            onRegisterPress={() => {
              setIsRegister(true);
              setShowAuthModal(true);
            }}
            styles={styles}
          />
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
            {!isRegister && (
              <Pressable
                style={{ alignItems: "center", paddingVertical: spacing.xs }}
                onPress={() => {
                  setShowAuthModal(false);
                  router.push("/forgot-password" as any);
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                  Esqueci minha senha
                </Text>
              </Pressable>
            )}
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
      {dialog}
    </SafeAreaView>
  );
}

function getUsageBarColor(usagePercent: number) {
  if (usagePercent > 90) return colors.danger;
  if (usagePercent > 70) return colors.warning;
  return colors.primary;
}

function AuthPromptCard({
  onLoginPress,
  onRegisterPress,
  styles,
}: Readonly<{
  onLoginPress: () => void;
  onRegisterPress: () => void;
  styles: ReturnType<typeof createStyles>;
}>) {
  return (
    <View style={styles.card}>
      <Ionicons name="person-circle-outline" size={48} color={colors.textMuted} />
      <Text style={styles.cardTitle}>Faça login ou crie sua conta</Text>
      <Text style={styles.cardText}>
        Para usar a IA e ver seu plano, entre com sua conta ou crie uma nova.
      </Text>
      <View style={{ gap: spacing.sm, width: "100%" }}>
        <Button title="Entrar" onPress={onLoginPress} />
        <Button title="Criar conta" variant="secondary" onPress={onRegisterPress} />
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.expenseBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  fallbackCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.info + "1a",
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  fallbackText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  cardTextSmall: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    fontStyle: "italic",
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
  planCardPro: { backgroundColor: colors.primaryDark },
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
}
