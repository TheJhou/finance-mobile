import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface AccountRowProps {
  icon: string;
  iconColor: string;
  iconBg?: string;
  label: string;
  value?: string;
  subtitle?: string;
  chevron?: boolean;
  onPress?: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
}

export function AccountRow({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  subtitle,
  chevron = true,
  onPress,
  danger = false,
  rightElement,
}: Readonly<AccountRowProps>) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const bg = iconBg ?? iconColor + "22";
  const content = (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.label, danger && { color: colors.danger }]}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {rightElement}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.touchable}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function createStyles() {
  return StyleSheet.create({
  touchable: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    marginVertical: -spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  value: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  });
}
