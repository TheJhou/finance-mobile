import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = true, style }: Props) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {content}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.lg },
  });
}
