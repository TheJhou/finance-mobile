import { colors, radius } from "@/lib/theme";
import type { TransactionStatus } from "@/lib/types";
import { formatDateLocal } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

interface DueBadgeProps {
  readonly status: TransactionStatus;
  readonly dueDate: string;
  readonly compact?: boolean;
}

interface BadgeConfig {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

function getBadgeConfig(status: TransactionStatus, dueDate: string): BadgeConfig {
  const today = formatDateLocal(new Date());
  const dueMs = new Date(dueDate + "T00:00:00").getTime();
  const todayMs = new Date(today + "T00:00:00").getTime();
  const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (status === "PAID") {
    return { label: "Pago", color: colors.success, icon: "checkmark-circle" };
  }

  if (status === "OVERDUE" || diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      label: absDays === 0 ? "Vence hoje" : `Vencido ${absDays}d`,
      color: colors.danger,
      icon: "alert-circle",
    };
  }

  if (diffDays === 0) {
    return { label: "Vence hoje", color: colors.warning, icon: "time-outline" };
  }

  if (diffDays <= 7) {
    return { label: `Vence em ${diffDays}d`, color: colors.warning, icon: "time-outline" };
  }

  return { label: "A vencer", color: colors.textMuted, icon: "calendar-outline" };
}

export function DueBadge({ status, dueDate, compact = false }: DueBadgeProps) {
  const config = useMemo(() => getBadgeConfig(status, dueDate), [status, dueDate]);

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.color + "22" },
        compact && styles.badgeCompact,
      ]}
    >
      <Ionicons name={config.icon} size={compact ? 10 : 12} color={config.color} />
      <Text style={[styles.text, { color: config.color }, compact && styles.textCompact]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeCompact: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: "600",
  },
  textCompact: {
    fontSize: 9,
  },
});
