import { colors, radius, spacing } from "@/lib/theme";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

interface AccountSectionProps {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function AccountSection({ title, children, style }: Readonly<AccountSectionProps>) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
});
