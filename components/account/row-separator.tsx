import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

export function RowSeparator() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  return <View style={styles.separator} />;
}

function createStyles() {
  return StyleSheet.create({
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 52 + spacing.md,
    },
  });
}
