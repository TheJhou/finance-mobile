import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";

import { StyleSheet, View } from "react-native";

export function RowSeparator() {
  const styles = useThemedStyles(createStyles);
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
