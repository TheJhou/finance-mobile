import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ToggleRowProps {
  icon: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: () => void;
}

export function ToggleRow({
  icon,
  iconColor,
  label,
  subtitle,
  value,
  onToggle,
}: Readonly<ToggleRowProps>) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}>
          <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
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
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    padding: 2,
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  toggleOff: {
    backgroundColor: colors.border,
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  thumbOn: {
    backgroundColor: "#fff",
    alignSelf: "flex-end",
  },
  thumbOff: {
    backgroundColor: colors.textMuted,
  },
  });
}
