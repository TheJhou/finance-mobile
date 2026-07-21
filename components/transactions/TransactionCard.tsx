import { DueBadge } from "@/components/transactions/DueBadge";
import { colors, radius, spacing } from "@/lib/theme";
import type { Transaction } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

const paymentIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  CASH: "cash-outline",
  PIX: "flash-outline",
  CREDIT_CARD: "card-outline",
  DEBIT_CARD: "card-outline",
  BANK_TRANSFER: "business-outline",
  BOLETO: "barcode-outline",
  MERCADO_PAGO: "wallet-outline",
  OTHER: "ellipsis-horizontal-circle-outline",
};

const paymentLabels: Record<string, string> = {
  CASH: "Dinheiro",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  BANK_TRANSFER: "Transf.",
  MERCADO_PAGO: "MP",
  OTHER: "Outro",
};

const sourceLabels: Record<string, string> = {
  MANUAL: "Manual",
  IMPORT: "Importado",
  BANK_NOTIFICATION: "Notificação",
};

const sourceIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  MANUAL: "hand-right-outline",
  IMPORT: "cloud-download-outline",
  BANK_NOTIFICATION: "notifications-outline",
};

interface TransactionCardProps {
  readonly transaction: Transaction;
  readonly onEdit: (item: Transaction) => void;
  readonly onDelete: (item: Transaction) => void;
  readonly onMarkPaid?: (item: Transaction) => void;
  readonly showDueInfo?: boolean;
  readonly confirmLabel?: string;
}

export function TransactionCard({
  transaction,
  onEdit,
  onDelete,
  onMarkPaid,
  showDueInfo = false,
  confirmLabel = "Confirmar",
}: TransactionCardProps) {
  const isIncome = transaction.type === "INCOME";
  const itemSource = transaction.source ?? "MANUAL";

  return (
    <View style={styles.card}>
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isIncome ? colors.incomeBg : colors.expenseBg,
          },
        ]}
      >
        <Ionicons
          name={isIncome ? "arrow-up" : "arrow-down"}
          size={18}
          color={isIncome ? colors.incomeFg : colors.expenseFg}
        />
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={styles.desc} numberOfLines={1}>
            {transaction.description}
          </Text>
          {showDueInfo && (
            <DueBadge status={transaction.status} dueDate={transaction.date} compact />
          )}
        </View>

        <Text style={styles.meta}>
          {transaction.category?.name ?? "Sem categoria"} · {formatDate(transaction.date)}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons
              name={paymentIcons[transaction.paymentMethod] ?? "cash-outline"}
              size={12}
              color={colors.textMuted}
            />
            <Text style={styles.metaSmall}>
              {paymentLabels[transaction.paymentMethod] ?? transaction.paymentMethod}
            </Text>
          </View>
          {itemSource !== "MANUAL" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons
                name={sourceIcons[itemSource] ?? "hand-right-outline"}
                size={12}
                color={colors.textMuted}
              />
              <Text style={styles.metaSmall}>{sourceLabels[itemSource] ?? itemSource}</Text>
            </View>
          )}
          {transaction.bankOrigin && (
            <Text style={styles.metaSmall}>· {transaction.bankOrigin}</Text>
          )}
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={[
            styles.amount,
            { color: isIncome ? colors.incomeFg : colors.expenseFg },
          ]}
        >
          {isIncome ? "+" : "-"}
          {formatCurrency(transaction.amount)}
        </Text>

        <View style={styles.actionButtons}>
          {onMarkPaid && transaction.status !== "PAID" && (
            <Pressable
              style={[styles.actionButton, styles.confirmButton]}
              onPress={() => onMarkPaid(transaction)}
              hitSlop={10}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
            </Pressable>
          )}
          <Pressable
            style={styles.actionButton}
            onPress={() => onEdit(transaction)}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => onDelete(transaction)}
            hitSlop={10}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  desc: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  metaSmall: { fontSize: 11, color: colors.textMuted },
  amount: { fontSize: 15, fontWeight: "700" },
  actionButtons: { flexDirection: "row", gap: 4, marginTop: 4 },
  actionButton: { padding: 6, borderRadius: 4 },
  confirmButton: {
    backgroundColor: colors.success + "15",
    borderRadius: 6,
  },
});
