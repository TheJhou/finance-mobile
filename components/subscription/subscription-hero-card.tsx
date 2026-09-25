import type { HeadlineTone, SubscriptionHeadline } from "@/lib/subscription-display";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

function toneColor(tone: HeadlineTone): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

interface Props {
  headline: SubscriptionHeadline;
  /** Ex.: "R$ 3,00/mês"; omitido no plano gratuito */
  priceLabel?: string | null;
}

/** Cartão do topo da tela de Assinatura: plano, situação e renovação. */
export function SubscriptionHeroCard({ headline, priceLabel }: Readonly<Props>) {
  const styles = useThemedStyles(createStyles);
  const accent = headline.isPro ? colors.warning : colors.primary;
  const badgeColor = toneColor(headline.tone);

  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: accent + "22" }]}>
        <Ionicons name={headline.isPro ? "diamond" : "leaf-outline"} size={30} color={accent} />
      </View>
      <Text style={styles.title}>{headline.title}</Text>
      <View style={[styles.badge, { backgroundColor: badgeColor + "22" }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{headline.badge}</Text>
      </View>
      {headline.isPro && priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : null}
      {headline.detail ? <Text style={styles.detail}>{headline.detail}</Text> : null}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: {
      alignItems: "center",
      paddingVertical: spacing["2xl"],
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    icon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    title: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
    badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
    price: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    detail: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  });
}
