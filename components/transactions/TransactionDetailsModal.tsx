import { DueBadge } from "@/components/transactions/DueBadge";
import { colors, radius, spacing } from "@/lib/theme";
import type { DocumentType, PaymentMethod, Transaction, TransactionSource } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  BANK_TRANSFER: "Transferência",
  BOLETO: "Boleto",
  MERCADO_PAGO: "Mercado Pago",
  OTHER: "Outro",
};

const documentTypeLabels: Record<DocumentType, string> = {
  NORMAL: "Gasto Normal",
  BOLETO: "Boleto",
  NOTA_FISCAL: "Nota Fiscal",
  COMPROVANTE_PIX: "Comprovante PIX",
  COMPROVANTE_BANCARIO: "Comprovante Bancário",
  OUTRO: "Outro",
};

const sourceLabels: Record<TransactionSource, string> = {
  MANUAL: "Manual",
  IMPORT: "Importado",
  BANK_NOTIFICATION: "Notificação",
};

interface DetailRowProps {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly value: string;
}

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={colors.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

interface TransactionDetailsModalProps {
  readonly visible: boolean;
  readonly transaction: Transaction | null;
  readonly onClose: () => void;
  readonly onEdit: (item: Transaction) => void;
  readonly onDelete: (item: Transaction) => void;
}

export function TransactionDetailsModal({
  visible,
  transaction,
  onClose,
  onEdit,
  onDelete,
}: TransactionDetailsModalProps) {
  if (!transaction) return null;

  const isIncome = transaction.type === "INCOME";

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Detalhes</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.amountBlock}>
            <View
              style={[
                styles.amountIcon,
                { backgroundColor: isIncome ? colors.incomeBg : colors.expenseBg },
              ]}
            >
              <Ionicons
                name={isIncome ? "arrow-up" : "arrow-down"}
                size={22}
                color={isIncome ? colors.incomeFg : colors.expenseFg}
              />
            </View>
            <Text style={styles.description}>{transaction.description}</Text>
            <Text style={[styles.amount, { color: isIncome ? colors.incomeFg : colors.expenseFg }]}>
              {isIncome ? "+" : "-"}{formatCurrency(transaction.amount)}
            </Text>
            <DueBadge status={transaction.status} dueDate={transaction.date} />
          </View>

          <View style={styles.card}>
            <DetailRow icon="calendar-outline" label="Data" value={formatDate(transaction.date)} />
            <DetailRow
              icon="pricetag-outline"
              label="Categoria"
              value={transaction.category?.name ?? "Sem categoria"}
            />
            <DetailRow
              icon="wallet-outline"
              label="Pagamento"
              value={paymentLabels[transaction.paymentMethod] ?? transaction.paymentMethod}
            />
            <DetailRow
              icon="document-text-outline"
              label="Documento"
              value={documentTypeLabels[transaction.documentType] ?? transaction.documentType}
            />
            <DetailRow
              icon="hand-right-outline"
              label="Origem"
              value={sourceLabels[transaction.source] ?? transaction.source}
            />
            {transaction.bankOrigin && (
              <DetailRow icon="business-outline" label="Banco" value={transaction.bankOrigin} />
            )}
            {transaction.recipientName && (
              <DetailRow icon="person-outline" label="Nome" value={transaction.recipientName} />
            )}
            {transaction.cnpj && (
              <DetailRow icon="card-outline" label="CPF/CNPJ" value={transaction.cnpj} />
            )}
            {transaction.boletoNumber && (
              <DetailRow icon="barcode-outline" label="Código" value={transaction.boletoNumber} />
            )}
          </View>

          {transaction.notes && (
            <View style={styles.card}>
              <Text style={styles.notesTitle}>Observações</Text>
              <Text style={styles.notesText}>{transaction.notes}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => {
                onClose();
                onEdit(transaction);
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.actionBtnText}>Editar</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => {
                onClose();
                onDelete(transaction);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.actionBtnText, { color: colors.danger }]}>Excluir</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] },
  amountBlock: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  amountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  description: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, textAlign: "center" },
  amount: { fontSize: 26, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowIcon: { width: 18 },
  rowLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, flexShrink: 1, textAlign: "right", maxWidth: "60%" },
  notesTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  editBtn: { backgroundColor: colors.surface, borderColor: colors.border },
  deleteBtn: { backgroundColor: colors.expenseBg + "15", borderColor: colors.danger },
  actionBtnText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
});
