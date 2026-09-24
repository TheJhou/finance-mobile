import { TransactionCard } from "@/components/transactions/TransactionCard";
import { TransactionFilters, type Filters, getDateRange, isFiltersActive, activeFilterCount, INITIAL_FILTERS } from "@/components/transactions/TransactionFilters";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { listCategories } from "@/lib/repositories/categories";
import { deleteTransaction, listTransactions } from "@/lib/repositories/transactions";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { Category, Transaction } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, UIManager, View } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DaySection {
  date: string;
  income: number;
  expense: number;
  balance: number;
  data: Transaction[];
}

function formatGroupDate(dateStr: string): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (dateStr === todayStr) return "Hoje";
  if (dateStr === yesterdayStr) return "Ontem";

  const date = new Date(dateStr + "T00:00:00");
  const formatted = date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

interface HistoryTabProps {
  readonly onEditTransaction: (item: Transaction) => void;
  readonly refreshKey: number;
}

export function HistoryTab({ onEditTransaction, refreshKey }: HistoryTabProps) {
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [confirmDel, setConfirmDel] = useState<Transaction | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const [res, cats] = await Promise.all([listTransactions(), listCategories()]);
      setItems(res.filter((t) => t.status === "PAID"));
      setCategories(cats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const filteredItems = useMemo(() => {
    let result = items;
    const range = getDateRange(filters.datePreset);
    if (range) result = result.filter((t) => t.date >= range.from && t.date <= range.to);
    if (filters.dateFrom) result = result.filter((t) => t.date >= filters.dateFrom);
    if (filters.dateTo) result = result.filter((t) => t.date <= filters.dateTo);
    if (filters.type !== "ALL") result = result.filter((t) => t.type === filters.type);
    if (filters.categoryIds.length > 0) result = result.filter((t) => filters.categoryIds.includes(t.categoryId));
    const min = Number.parseFloat(filters.amountMin.replace(",", "."));
    const max = Number.parseFloat(filters.amountMax.replace(",", "."));
    if (Number.isFinite(min) && min > 0) result = result.filter((t) => Number(t.amount) >= min);
    if (Number.isFinite(max) && max > 0) result = result.filter((t) => Number(t.amount) <= max);
    if (filters.status !== "ALL") result = result.filter((t) => t.status === filters.status);
    if (filters.paymentMethod !== "ALL") result = result.filter((t) => t.paymentMethod === filters.paymentMethod);
    if (filters.source !== "ALL") result = result.filter((t) => (t.source ?? "MANUAL") === filters.source);
    const search = filters.searchText.trim().toLowerCase();
    if (search) {
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(search) ||
          (t.notes?.toLowerCase().includes(search) ?? false) ||
          (t.category?.name.toLowerCase().includes(search) ?? false)
      );
    }
    return result;
  }, [items, filters]);

  const sections = useMemo<DaySection[]>(() => {
    const map = new Map<string, DaySection>();
    for (const item of filteredItems) {
      let section = map.get(item.date);
      if (!section) {
        section = { date: item.date, income: 0, expense: 0, balance: 0, data: [] };
        map.set(item.date, section);
      }
      section.data.push(item);
      const amount = Number(item.amount);
      if (item.type === "INCOME") section.income += amount;
      else section.expense += amount;
      section.balance = section.income - section.expense;
    }
    return Array.from(map.values());
  }, [filteredItems]);

  const filterCount = activeFilterCount(filters);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.subHeader}>
        <Text style={styles.subtitle}>
          {filteredItems.length} {filteredItems.length === items.length ? "" : `de ${items.length} `}registros pagos
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
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={isFiltersActive(filters) ? "filter-outline" : "checkmark-done-outline"} size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{isFiltersActive(filters) ? "Nenhum resultado" : "Nenhuma transação paga"}</Text>
            <Text style={styles.emptyHint}>{isFiltersActive(filters) ? "Tente ajustar os filtros." : "As transações pagas aparecem aqui."}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>{formatGroupDate(section.date)}</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.sectionBalance, { color: section.balance >= 0 ? colors.incomeFg : colors.expenseFg }]}>
                {section.balance >= 0 ? "+" : "-"}{formatCurrency(Math.abs(section.balance))}
              </Text>
              <Text style={styles.sectionMeta}>
                +{formatCurrency(section.income)} · -{formatCurrency(section.expense)}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionCard
            transaction={item}
            onEdit={onEditTransaction}
            onDelete={(t) => setConfirmDel(t)}
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
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.xs,
      paddingTop: spacing.sm,
    },
    sectionDate: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    sectionBalance: { fontSize: 13, fontWeight: "700" },
    sectionMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
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
