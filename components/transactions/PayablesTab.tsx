import { TransactionCard } from "@/components/transactions/TransactionCard";
import {
  TransactionFilters,
  type Filters,
  getDateRange,
  isFiltersActive,
  activeFilterCount,
  INITIAL_FILTERS,
} from "@/components/transactions/TransactionFilters";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { listCategories } from "@/lib/repositories/categories";
import { deleteTransaction, listTransactions, markAsPaid, markOverdueTransactions } from "@/lib/repositories/transactions";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, LayoutAnimation, Platform, Pressable, RefreshControl, StyleSheet, Text, UIManager, View } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

function matchesPendingFilters(t: Transaction, filters: Filters, type: TransactionType): boolean {
  if (t.type !== type) return false;

  if (filters.status === "ALL") {
    if (t.status !== "PENDING" && t.status !== "OVERDUE") return false;
  } else if (t.status !== filters.status) {
    return false;
  }

  const range = getDateRange(filters.datePreset);
  if (range && (t.date < range.from || t.date > range.to)) return false;
  if (filters.dateFrom && t.date < filters.dateFrom) return false;
  if (filters.dateTo && t.date > filters.dateTo) return false;
  if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(t.categoryId)) return false;

  const min = Number.parseFloat(filters.amountMin.replace(",", "."));
  const max = Number.parseFloat(filters.amountMax.replace(",", "."));
  if (Number.isFinite(min) && min > 0 && Number(t.amount) < min) return false;
  if (Number.isFinite(max) && max > 0 && Number(t.amount) > max) return false;

  if (filters.paymentMethod !== "ALL" && t.paymentMethod !== filters.paymentMethod) return false;
  if (filters.source !== "ALL" && (t.source ?? "MANUAL") !== filters.source) return false;

  const search = filters.searchText.trim().toLowerCase();
  if (search) {
    const match =
      t.description.toLowerCase().includes(search) ||
      (t.notes?.toLowerCase().includes(search) ?? false) ||
      (t.category?.name.toLowerCase().includes(search) ?? false);
    if (!match) return false;
  }

  return true;
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
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Transaction | null>(null);
  const [confirmPaid, setConfirmPaid] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    ...INITIAL_FILTERS,
    type: "ALL",
    status: "ALL",
  });

  const isExpense = type === "EXPENSE";

  const fetchItems = useCallback(async () => {
    try {
      await markOverdueTransactions();
      const [res, cats] = await Promise.all([listTransactions(), listCategories()]);
      setItems([...res].sort((a, b) => a.date.localeCompare(b.date)));
      setCategories(cats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filteredItems = useMemo(
    () => items.filter((t) => matchesPendingFilters(t, filters, type)).sort((a, b) => a.date.localeCompare(b.date)),
    [items, filters, type]
  );

  const filterCount = activeFilterCount(filters);

  const emptyState = useMemo(() => {
    const hasFilters = isFiltersActive(filters);
    if (hasFilters) {
      return {
        icon: "filter-outline" as keyof typeof Ionicons.glyphMap,
        title: "Nenhum resultado",
        hint: "Tente ajustar os filtros.",
      };
    }
    if (isExpense) {
      return {
        icon: "checkmark-done-outline" as keyof typeof Ionicons.glyphMap,
        title: "Nenhuma conta a pagar",
        hint: "Contas pendentes aparecerão aqui.",
      };
    }
    return {
      icon: "cash-outline" as keyof typeof Ionicons.glyphMap,
      title: "Nada a receber",
      hint: "Recebimentos pendentes aparecerão aqui.",
    };
  }, [filters, isExpense]);

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
    () => filteredItems.reduce((sum, t) => sum + Number(t.amount), 0),
    [filteredItems]
  );

  const overdueCount = useMemo(() => filteredItems.filter((t) => t.status === "OVERDUE").length, [filteredItems]);

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
          <Text style={styles.summaryCount}>{filteredItems.length} {isExpense ? "contas" : "recebimentos"}</Text>
          {overdueCount > 0 && (
            <View style={styles.overdueBadge}>
              <Ionicons name="alert-circle" size={12} color={colors.danger} />
              <Text style={styles.overdueText}>{overdueCount} vencido{overdueCount > 1 ? "s" : ""}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subtitle}>
          {filteredItems.length} {isExpense ? "contas a pagar" : "recebimentos"}
        </Text>
        <Pressable
          style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowFilters((v) => !v);
          }}
          hitSlop={6}
        >
          <Ionicons name="options-outline" size={20} color={showFilters ? colors.textInverse : colors.primary} />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <TransactionFilters
        filters={filters}
        onChange={setFilters}
        categories={categories}
        visible={showFilters}
        hideType
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={emptyState.icon} size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{emptyState.title}</Text>
            <Text style={styles.emptyHint}>{emptyState.hint}</Text>
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
    subHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    subtitle: { fontSize: 13, color: colors.textSecondary },
    filterToggle: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.danger,
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    filterBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff" },
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
