import {
  dismissUnrecognized,
  listUnrecognizedNotifications,
  promoteUnrecognized,
  type NotificationLogEntry,
} from "@/lib/notification-inbox";
import { onNotificationQueued } from "@/lib/notification-events";
import { BANK_APPS, guessTransaction } from "@/lib/notifications/parsers";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { TransactionType } from "@/lib/types";
import { formatCurrencyInput, formatDate, parseCurrencyInput } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  onToast: (type: "success" | "error" | "warning", message: string) => void;
}

interface ReviewForm {
  entry: NotificationLogEntry;
  amount: string;
  type: TransactionType;
  description: string;
}

/**
 * Notificações de banco com valor em R$ que o parser não soube interpretar.
 * Antes eram descartadas em silêncio; aqui o usuário revisa e decide.
 */
export function UnrecognizedNotifications({ onToast }: Props) {
  const styles = useThemedStyles(createStyles);
  const [entries, setEntries] = useState<NotificationLogEntry[]>([]);
  const [review, setReview] = useState<ReviewForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await listUnrecognizedNotifications());
    } catch (error) {
      console.warn("[Unrecognized] Falha ao carregar:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => onNotificationQueued(() => void load()), [load]);

  if (entries.length === 0) return null;

  const openReview = (entry: NotificationLogEntry) => {
    const guess = guessTransaction(entry.rawText);
    setReview({
      entry,
      amount: guess.amount !== null ? formatCurrencyInput(guess.amount) : "",
      type: guess.type,
      description: guess.description,
    });
  };

  const handleDismiss = async (entry: NotificationLogEntry) => {
    await dismissUnrecognized(entry.id);
    await load();
    onToast("warning", "Notificação descartada");
  };

  const handleConfirm = async () => {
    if (!review) return;
    const amount = parseCurrencyInput(review.amount);
    if (!(amount > 0)) {
      onToast("error", "Informe um valor maior que zero");
      return;
    }
    setSaving(true);
    try {
      await promoteUnrecognized(review.entry.id, {
        amount,
        type: review.type,
        description: review.description,
      });
      setReview(null);
      await load();
      onToast("success", "Enviada para aprovação");
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="help-circle-outline" size={16} color={colors.warning} />
        <Text style={styles.sectionLabel}>Não reconhecidas ({entries.length})</Text>
      </View>
      <Text style={styles.hint}>
        Notificações com valor que o app não soube interpretar. Revise para não perder nenhuma transação.
      </Text>

      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.bank}>{BANK_APPS[entry.packageName] ?? entry.packageName}</Text>
            <Text style={styles.date}>{formatDate(new Date(entry.postTime))}</Text>
          </View>
          <Text style={styles.raw} numberOfLines={4}>
            {entry.rawText}
          </Text>
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => openReview(entry)}>
              <Ionicons name="create-outline" size={14} color="#fff" />
              <Text style={styles.actionText}>Revisar</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.danger }]} onPress={() => void handleDismiss(entry)}>
              <Ionicons name="close" size={14} color="#fff" />
              <Text style={styles.actionText}>Não é transação</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Modal
        visible={review !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReview(null)}
      >
        <SafeAreaView style={styles.modalSafe} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setReview(null)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Revisar notificação</Text>
            <View style={{ width: 26 }} />
          </View>
          {review && (
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.rawBox}>
                <Text style={styles.raw}>{review.entry.rawText}</Text>
              </View>

              <View style={styles.typeRow}>
                {(["EXPENSE", "INCOME"] as const).map((type) => {
                  const active = review.type === type;
                  const color = type === "INCOME" ? colors.incomeFg : colors.expenseFg;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.typeBtn, active && { borderColor: color, backgroundColor: color + "22" }]}
                      onPress={() => setReview({ ...review, type })}
                    >
                      <Text style={[styles.typeText, active && { color }]}>{type === "INCOME" ? "Receita" : "Despesa"}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Valor (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={review.amount}
                  onChangeText={(amount) => setReview({ ...review, amount })}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Descrição</Text>
                <TextInput
                  style={styles.input}
                  value={review.description}
                  onChangeText={(description) => setReview({ ...review, description })}
                  placeholder="Ex.: Mercado, Pix para Maria"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <Pressable
                style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
                onPress={() => void handleConfirm()}
                disabled={saving}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.confirmText}>Enviar para aprovação</Text>
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
    card: {
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      gap: 6,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    bank: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
    date: { fontSize: 11, color: colors.textMuted },
    raw: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
      borderRadius: radius.sm,
      gap: 4,
    },
    actionText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    modalSafe: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
    modalContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
    rawBox: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeRow: { flexDirection: "row", gap: spacing.sm },
    typeBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    typeText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
    label: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceElevated,
    },
    confirmBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primaryDark,
      borderRadius: radius.md,
      paddingVertical: 13,
    },
    confirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  });
}
