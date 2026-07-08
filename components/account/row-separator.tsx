import { colors, spacing } from "@/lib/theme";
import { StyleSheet, View } from "react-native";

export function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 52 + spacing.md,
  },
});
