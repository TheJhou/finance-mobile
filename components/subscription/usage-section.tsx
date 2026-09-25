import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { getUsagePercent } from "@/lib/subscription-display";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { SubscriptionStatus } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

function meterColor(percent: number): string {
  if (percent > 90) return colors.danger;
  if (percent > 70) return colors.warning;
  return colors.primary;
}

function Meter({
  icon,
  label,
  value,
  percent,
  hint,
}: Readonly<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: string; percent: number; hint?: string }>) {
  const styles = useThemedStyles(createStyles);
  const color = meterColor(percent);
  return (
    <View style={styles.meter}>
      <View style={styles.meterHeader}>
        <View style={[styles.icon, { backgroundColor: color + "22" }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Uso da IA no mês e backups na nuvem, em relação ao limite do plano. */
export function UsageSection({ status }: Readonly<{ status: SubscriptionStatus }>) {
  const usagePercent = getUsagePercent(status);
  const resetDate = new Date(status.usage.resetsAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const backups = status.backups;

  return (
    <AccountSection title="Seu uso">
      <Meter
        icon="sparkles-outline"
        label="Uso de IA no mês"
        value={`${usagePercent}%`}
        percent={usagePercent}
        hint={`Renova em ${resetDate}`}
      />
      {backups ? (
        <>
          <RowSeparator />
          <Meter
            icon="cloud-upload-outline"
            label="Backups na nuvem"
            value={`${backups.used} de ${backups.limit}`}
            percent={backups.limit ? Math.min(100, Math.round((backups.used / backups.limit) * 100)) : 0}
          />
        </>
      ) : null}
    </AccountSection>
  );
}

function createStyles() {
  return StyleSheet.create({
    // Mesmas medidas do AccountRow, para a seção combinar com o resto da tela
    meter: { paddingVertical: spacing.sm, gap: spacing.sm },
    meterHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    label: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    value: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    barBg: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
    barFill: { height: 6, borderRadius: 3 },
    hint: { fontSize: 12, color: colors.textMuted },
  });
}
