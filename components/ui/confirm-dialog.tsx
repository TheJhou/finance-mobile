import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

type ConfirmVariant = "default" | "danger" | "warning" | "success";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  /** Terceira ação opcional, exibida como link abaixo dos botões. */
  secondaryText?: string;
  onSecondary?: () => void | Promise<void>;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
  secondaryText,
  onSecondary,
}: Readonly<ConfirmDialogProps>) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [loading, setLoading] = useState(false);

  const variantColor =
    variant === "danger"
      ? colors.danger
      : variant === "warning"
        ? colors.warning
        : variant === "success"
          ? colors.success
          : colors.primary;

  const iconName =
    variant === "danger"
      ? "trash-outline"
      : variant === "warning"
        ? "warning-outline"
        : variant === "success"
          ? "checkmark-circle-outline"
          : "help-circle-outline";

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const handleSecondary = async () => {
    if (!onSecondary) return;
    setLoading(true);
    try {
      await onSecondary();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={loading ? undefined : onCancel}>
      <Pressable style={styles.overlay} onPress={loading ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.iconWrap, { backgroundColor: variantColor + "22" }]}>
            <Ionicons name={iconName} size={28} color={variantColor} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {cancelText ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={onCancel}
                disabled={loading}
              >
                <Text style={styles.btnTextSecondary}>{cancelText}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.btn, { backgroundColor: variantColor }]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnTextPrimary}>{confirmText}</Text>
              )}
            </Pressable>
          </View>
          {secondaryText && onSecondary ? (
            <Pressable onPress={handleSecondary} disabled={loading} hitSlop={8}>
              <Text style={[styles.secondaryLink, { color: variantColor }]}>{secondaryText}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 360,
      alignItems: "center",
      gap: spacing.md,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "center",
    },
    message: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
      width: "100%",
    },
    btn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    btnSecondary: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnTextSecondary: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 15,
    },
    btnTextPrimary: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
    },
    secondaryLink: {
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
      paddingVertical: spacing.xs,
    },
  });
}
