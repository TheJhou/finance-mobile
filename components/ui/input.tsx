import { colors, radius } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";

import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 48,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger },
  });
}
