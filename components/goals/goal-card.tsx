import type { GoalData } from "@/lib/backend";
import { describeGoalProgress, isGoalDone } from "@/lib/goals";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  goal: GoalData;
  onDeposit: () => void;
  onEdit: () => void;
}

export function GoalCard({ goal, onDeposit, onEdit }: Readonly<Props>) {
  const styles = useThemedStyles(createStyles);
  const done = isGoalDone(goal);
  const accent = goal.color || colors.primary;
  const percent = Math.min(100, Math.max(0, goal.progress));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: accent + "22" }]}>
          <Ionicons name={(goal.icon as keyof typeof Ionicons.glyphMap) || "trending-up"} size={20} color={accent} />
        </View>
        <View style={styles.titleBox}>
          <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
          <Text style={styles.amounts}>
            {formatCurrency(goal.savedValue)} de {formatCurrency(goal.targetValue)}
          </Text>
        </View>
        <Text style={[styles.percent, { color: done ? colors.success : accent }]}>{percent}%</Text>
      </View>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: done ? colors.success : accent }]} />
      </View>

      <View style={styles.footer}>
        {done ? <Ionicons name="checkmark-circle" size={14} color={colors.success} /> : null}
        <Text style={[styles.hint, done && { color: colors.success }]} numberOfLines={2}>
          {describeGoalProgress(goal)}
        </Text>
      </View>

      <View style={styles.actions}>
        {!done && (
          <Pressable style={[styles.actionBtn, { backgroundColor: accent }]} onPress={onDeposit}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.actionTextLight}>Depositar</Text>
          </Pressable>
        )}
        <Pressable style={[styles.actionBtn, styles.actionSecondary]} onPress={onEdit}>
          <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
          <Text style={styles.actionText}>Editar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    titleBox: { flex: 1, gap: 2 },
    name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    amounts: { fontSize: 12, color: colors.textSecondary },
    percent: { fontSize: 16, fontWeight: "800" },
    barBg: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
    barFill: { height: 8, borderRadius: 4 },
    footer: { flexDirection: "row", alignItems: "center", gap: 4 },
    hint: { flex: 1, fontSize: 12, color: colors.textMuted },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    actionSecondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    actionText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    actionTextLight: { fontSize: 13, fontWeight: "700", color: "#fff" },
  });
}
