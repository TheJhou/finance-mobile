import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: Props) {
  const bg: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.surface,
    ghost: "transparent",
    danger: colors.danger,
  };
  const fg: Record<Variant, string> = {
    primary: colors.textInverse,
    secondary: colors.textPrimary,
    ghost: colors.primary,
    danger: colors.textInverse,
  };
  const border = variant === "secondary" ? colors.border : "transparent";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg[variant],
          borderColor: border,
          opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={[styles.title, { color: fg[variant] }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
  },
});
