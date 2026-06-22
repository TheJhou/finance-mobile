import { colors, radius, spacing } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PlanFeature {
  label: string;
  free: boolean;
  pro: boolean;
}

const FEATURES: PlanFeature[] = [
  { label: "Transações ilimitadas", free: true, pro: true },
  { label: "Categorias ilimitadas", free: true, pro: true },
  { label: "Relatório DRE", free: true, pro: true },
  { label: "Exportar CSV", free: true, pro: true },
  { label: "Exportar Excel (XLSX)", free: false, pro: true },
  { label: "Exportar PDF", free: false, pro: true },
  { label: "IA para importar por foto", free: "5/mês" as any, pro: "Ilimitado" as any },
  { label: "IA para importar por texto", free: "10/mês" as any, pro: "Ilimitado" as any },
  { label: "OCR de documentos", free: false, pro: true },
  { label: "Suporte prioritário", free: false, pro: true },
];

export default function BillingScreen() {
  const router = useRouter();

  const handleSubscribe = () => {
    Linking.openURL("https://backend-final-production-659a.up.railway.app/purchase");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assinatura</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="diamond" size={14} color="#f472b6" />
            <Text style={styles.heroBadgeText}>PRO</Text>
          </View>
          <Text style={styles.heroTitle}>Finance Pro</Text>
          <Text style={styles.heroSubtitle}>
            Desbloqueie exportações ilimitadas e uso ilimitado de IA para controlar suas finanças sem limites.
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>R$ 14,90</Text>
            <Text style={styles.pricePeriod}> / mês</Text>
          </View>
        </View>

        {/* Planos */}
        <View style={styles.plansRow}>
          {/* Gratuito */}
          <View style={[styles.planCard, styles.planFree]}>
            <Text style={styles.planName}>Gratuito</Text>
            <Text style={styles.planPrice}>R$ 0</Text>
            <Text style={styles.planPriceSub}>para sempre</Text>
            <View style={styles.planDivider} />
            <Text style={styles.planCurrent}>Plano atual</Text>
          </View>

          {/* Pro */}
          <View style={[styles.planCard, styles.planPro]}>
            <View style={styles.planBadge}>
              <Ionicons name="diamond" size={11} color="#f472b6" />
              <Text style={styles.planBadgeText}>PRO</Text>
            </View>
            <Text style={[styles.planName, { color: "#f472b6" }]}>Finance Pro</Text>
            <Text style={[styles.planPrice, { color: colors.textPrimary }]}>R$ 14,90</Text>
            <Text style={styles.planPriceSub}>por mês</Text>
            <View style={styles.planDivider} />
            <TouchableOpacity style={styles.planBtn} onPress={handleSubscribe} activeOpacity={0.8}>
              <Text style={styles.planBtnText}>Assinar agora</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comparativo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comparativo de planos</Text>

          {FEATURES.map((f, i) => (
            <View key={i}>
              {i > 0 && <View style={styles.featureDivider} />}
              <View style={styles.featureRow}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <View style={styles.featureCells}>
                  <View style={styles.featureCell}>
                    {f.free === true ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    ) : f.free === false ? (
                      <Ionicons name="close-circle" size={18} color={colors.border} />
                    ) : (
                      <Text style={styles.featureLimitText}>{f.free}</Text>
                    )}
                  </View>
                  <View style={styles.featureCell}>
                    {f.pro === true ? (
                      <Ionicons name="checkmark-circle" size={18} color="#f472b6" />
                    ) : f.pro === false ? (
                      <Ionicons name="close-circle" size={18} color={colors.border} />
                    ) : (
                      <Text style={[styles.featureLimitText, { color: "#f472b6" }]}>{f.pro}</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ))}

          {/* Header das colunas */}
          <View style={styles.featureHeader}>
            <View style={{ flex: 1 }} />
            <View style={styles.featureCells}>
              <Text style={styles.featureColLabel}>Free</Text>
              <Text style={[styles.featureColLabel, { color: "#f472b6" }]}>Pro</Text>
            </View>
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handleSubscribe} activeOpacity={0.8}>
          <Ionicons name="diamond-outline" size={20} color="#fff" />
          <Text style={styles.ctaBtnText}>Começar com o Pro</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Cancele a qualquer momento. Cobrança mensal recorrente via Google Play.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#f472b644",
    padding: spacing["2xl"],
    alignItems: "center",
    gap: spacing.sm,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f472b622",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "#f472b644",
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#f472b6",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: spacing.sm,
  },
  priceValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#f472b6",
  },
  pricePeriod: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 4,
  },
  plansRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  planCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  planFree: {},
  planPro: {
    borderColor: "#f472b644",
    backgroundColor: "#f472b60a",
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f472b622",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#f472b6",
    letterSpacing: 0.8,
  },
  planName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  planPriceSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  planDivider: {
    height: 1,
    backgroundColor: colors.border,
    width: "100%",
    marginVertical: spacing.sm,
  },
  planCurrent: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  planBtn: {
    backgroundColor: "#f472b6",
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  planBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  featureLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  featureCells: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  featureCell: {
    width: 60,
    alignItems: "center",
  },
  featureColLabel: {
    width: 60,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  featureDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  featureLimitText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textAlign: "center",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#f472b6",
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  disclaimer: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingBottom: spacing.md,
  },
});
