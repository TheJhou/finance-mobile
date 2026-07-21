import { TransactionCard } from "@/components/transactions/TransactionCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteTransaction, listTransactions, markAsPaid, markOverdueTransactions } from "@/lib/repositories/transactions";
import { colors, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Transaction, TransactionType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

interface PendingTabProps {
  readonly onEditTransaction: (item: Transaction) => void;
  readonly refreshKey: number;
}

export function PayablesTab({ onEditTransaction, refreshKey }: PendingTabProps) {
  return <PendingTabContent type="EXPENSE" onEditTransaction={onEditTransaction} refreshKey={refreshKey} />;
}

export function ReceivablesTab({ onEditTransaction, refreshKey }: PendingTabProps) {
  return <PendingTabContent type="INCOME" onEditTransaction={onEditTransaction} refreshKey={refreshKey} />;
}

function PendingTabContent({
  type,
  onEditTransaction,
  refreshKey,
}: {
  readonly type: TransactionType;
  readonly onEditTransaction: (item: Transaction) => void;
  readonly refreshKey: number;
}) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Transaction | null>(null);
  const [confirmPaid, setConfirmPaid] = useState<Transaction | null>(null);

  const isExpense = type === "EXPENSE";

  const fetchItems = useCallback(async () => {
    try {
      await markOverdueTransactions();
      const res = await listTransactions();
      setItems(
        res
          .filter((t) => t.type === type && (t.status === "PENDING" || t.status === "OVERDUE"))
          .sort((a, b) => a.date.localeCompare(b.date))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      fetchItems();
    }, [fetchItems])
  );

  useEffect(() => {
    fetchItems();
  }, [refreshKey, fetchItems]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const handleMarkPaid = async (item: Transaction) => {
    setConfirmPaid(item);
  };

  const confirmMarkPaid = async () => {
    if (!confirmPaid) return;
    try {
      await markAsPaid(confirmPaid.id);
      setConfirmPaid(null);
      fetchItems();
    } catch (err) {
      setConfirmPaid(null);
      setError(err instanceof Error ? err.message : "Falha ao confirmar");
    }
  };

  const totalAmount = useMemo(
    () => items.reduce((sum, t) => sum + Number(t.amount), 0),
    [items]
  );

  const overdueCount = useMemo(() => items.filter((t) => t.status === "OVERDUE").length, [items]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          <Ionicons
            name={isExpense ? "arrow-down-circle" : "arrow-up-circle"}
            size={28}
            color={isExpense ? colors.expenseFg : colors.incomeFg}
          />
          <View>
            <Text style={styles.summaryLabel}>
              {isExpense ? "Total a pagar" : "Total a receber"}
            </Text>
            <Text style={[styles.summaryAmount, { color: isExpense ? colors.expenseFg : colors.incomeFg }]}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryCount}>{items.length} {isExpense ? "contas" : "recebimentos"}</Text>
          {overdueCount > 0 && (
            <View style={styles.overdueBadge}>
              <Ionicons name="alert-circle" size={12} color={colors.danger} />
              <Text style={styles.overdueText}>{overdueCount} vencido{overdueCount > 1 ? "s" : ""}</Text>
            </View>
          )}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={isExpense ? "checkmark-done-outline" : "cash-outline"} size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {isExpense ? "Nenhuma conta a pagar" : "Nada a receber"}
            </Text>
            <Text style={styles.emptyHint}>
              {isExpense ? "Contas pendentes aparecerão aqui." : "Recebimentos pendentes aparecerão aqui."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionCard
            transaction={item}
            onEdit={onEditTransaction}
            onDelete={(t) => setConfirmDel(t)}
            onMarkPaid={handleMarkPaid}
            showDueInfo
            confirmLabel={isExpense ? "Confirmar pagamento" : "Confirmar recebimento"}
          />
        )}
      />

      <ConfirmDialog
        visible={confirmDel !== null}
        title="Excluir transação"
        message={`Remover "${confirmDel?.description ?? ""}"?`}
        confirmText="Excluir"
        variant="danger"
        onCancel={() => setConfirmDel(null)}
        onConfirm={async () => {
          if (!confirmDel) return;
          try {
            await deleteTransaction(confirmDel.id);
            setConfirmDel(null);
            fetchItems();
          } catch {}
        }}
      />

      <ConfirmDialog
        visible={confirmPaid !== null}
        title={isExpense ? "Confirmar pagamento" : "Confirmar recebimento"}
        message={`Marcar "${confirmPaid?.description ?? ""}" como ${isExpense ? "pago" : "recebido"}?`}
        confirmText={isExpense ? "Pago" : "Recebido"}
        variant="success"
        onCancel={() => setConfirmPaid(null)}
        onConfirm={confirmMarkPaid}
      />
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    summaryCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    summaryLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "500" },
    summaryAmount: { fontSize: 20, fontWeight: "700", marginTop: 2 },
    summaryRight: { alignItems: "flex-end" },
    summaryCount: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
    overdueBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
      backgroundColor: colors.danger + "15",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    overdueText: { fontSize: 10, fontWeight: "600", color: colors.danger },
    error: {
      marginHorizontal: spacing.lg,
      fontSize: 13,
      color: colors.danger,
      backgroundColor: colors.expenseBg,
      padding: spacing.md,
      borderRadius: 8,
    },
    list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1, paddingBottom: 96 },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing["3xl"],
    },
    emptyText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    emptyHint: { fontSize: 13, color: colors.textSecondary, textAlign: "center", paddingHorizontal: spacing.xl },
  });
}
