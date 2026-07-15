import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { extractTransactionFromPhoto } from "@/lib/ai";
import { isAuthenticated } from "@/lib/auth";
import { listCategories } from "@/lib/repositories/categories";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/repositories/transactions";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Category, DocumentType, PaymentMethod, Transaction, TransactionSource, TransactionStatus, TransactionType } from "@/lib/types";
import { formatCurrency, formatCurrencyInput, formatDate, normalizePaymentMethod, parseCurrencyInput, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DatePreset = "today" | "week" | "month" | "year" | "all";

interface Filters {
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  type: TransactionType | "ALL";
  categoryIds: string[];
  amountMin: string;
  amountMax: string;
  status: TransactionStatus | "ALL";
  paymentMethod: PaymentMethod | "ALL";
  source: TransactionSource | "ALL";
  searchText: string;
}

const INITIAL_FILTERS: Filters = {
  datePreset: "month",
  dateFrom: "",
  dateTo: "",
  type: "ALL",
  categoryIds: [],
  amountMin: "",
  amountMax: "",
  status: "ALL",
  paymentMethod: "ALL",
  source: "ALL",
  searchText: "",
};

function ListSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

const documentTypeMeta: Record<DocumentType, {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  paymentMethod?: PaymentMethod;
}> = {
  NORMAL: {
    label: "Gasto Normal",
    description: "Descrição, valor, data e categoria.",
    icon: "receipt-outline",
    color: colors.textMuted,
  },
  BOLETO: {
    label: "Boleto",
    description: "Beneficiário, código de barras, vencimento e documento.",
    icon: "barcode-outline",
    color: colors.warning,
    paymentMethod: "BOLETO",
  },
  NOTA_FISCAL: {
    label: "Nota Fiscal",
    description: "Emitente, CNPJ/CPF e número da nota.",
    icon: "document-text-outline",
    color: colors.info,
  },
  COMPROVANTE_PIX: {
    label: "Comprovante PIX",
    description: "Pagador/recebedor, chave PIX e CPF/CNPJ.",
    icon: "qr-code-outline",
    color: colors.success,
    paymentMethod: "PIX",
  },
  COMPROVANTE_BANCARIO: {
    label: "Comprovante Bancário",
    description: "Banco, favorecido e CPF/CNPJ.",
    icon: "business-outline",
    color: colors.primary,
    paymentMethod: "BANK_TRANSFER",
  },
  OUTRO: {
    label: "Outro",
    description: "Campos extras opcionais para identificar o documento.",
    icon: "folder-outline",
    color: colors.cardOrange,
    paymentMethod: "OTHER",
  },
};

const documentTypeOptions = Object.entries(documentTypeMeta).map(([value, meta]) => ({
  value: value as DocumentType,
  ...meta,
}));

function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === "all") return null;
  const now = new Date();
  const to = toDateInputValue(now);
  let from: string;
  switch (preset) {
    case "today":
      from = to;
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      from = toDateInputValue(d);
      break;
    }
    case "month": {
      // Últimos 30 dias
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = toDateInputValue(d);
      break;
    }
    case "year":
      from = `${now.getFullYear()}-01-01`;
      break;
    default:
      return null;
  }
  return { from, to };
}

function isFiltersActive(f: Filters): boolean {
  return (
    f.datePreset !== "all" ||
    f.dateFrom !== "" ||
    f.dateTo !== "" ||
    f.type !== "ALL" ||
    f.categoryIds.length > 0 ||
    f.amountMin !== "" ||
    f.amountMax !== "" ||
    f.status !== "ALL" ||
    f.paymentMethod !== "ALL" ||
    f.source !== "ALL" ||
    f.searchText.trim() !== ""
  );
}

function activeFilterCount(f: Filters): number {
  let c = 0;
  if (f.datePreset !== "all" || f.dateFrom || f.dateTo) c++;
  if (f.type !== "ALL") c++;
  if (f.categoryIds.length > 0) c++;
  if (f.amountMin || f.amountMax) c++;
  if (f.status !== "ALL") c++;
  if (f.paymentMethod !== "ALL") c++;
  if (f.source !== "ALL") c++;
  if (f.searchText.trim()) c++;
  return c;
}

export default function TransactionsScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [confirmDel, setConfirmDel] = useState<{ item: Transaction } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const [res, cats] = await Promise.all([
        listTransactions(),
        listCategories(),
      ]);
      setItems(res);
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const filteredItems = useMemo(() => {
    let result = items;

    // Date preset
    const range = getDateRange(filters.datePreset);
    if (range) {
      result = result.filter((t) => t.date >= range.from && t.date <= range.to);
    }
    // Custom date range (overrides preset if both filled)
    if (filters.dateFrom) {
      result = result.filter((t) => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((t) => t.date <= filters.dateTo);
    }
    // Type
    if (filters.type !== "ALL") {
      result = result.filter((t) => t.type === filters.type);
    }
    // Categories
    if (filters.categoryIds.length > 0) {
      result = result.filter((t) => filters.categoryIds.includes(t.categoryId));
    }
    // Amount
    const min = Number.parseFloat(filters.amountMin.replace(",", "."));
    const max = Number.parseFloat(filters.amountMax.replace(",", "."));
    if (Number.isFinite(min) && min > 0) {
      result = result.filter((t) => Number(t.amount) >= min);
    }
    if (Number.isFinite(max) && max > 0) {
      result = result.filter((t) => Number(t.amount) <= max);
    }
    // Status
    if (filters.status !== "ALL") {
      result = result.filter((t) => t.status === filters.status);
    }
    // Payment method
    if (filters.paymentMethod !== "ALL") {
      result = result.filter((t) => t.paymentMethod === filters.paymentMethod);
    }
    // Source
    if (filters.source !== "ALL") {
      result = result.filter((t) => (t.source ?? "MANUAL") === filters.source);
    }
    // Search text
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

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((v) => !v);
  };

  const clearFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(INITIAL_FILTERS);
  };

  const toggleCategory = (id: string) => {
    setFilters((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }));
  };

  const handleDelete = (item: Transaction) => {
    setConfirmDel({ item });
  };

  const handleEdit = (item: Transaction) => {
    setEditingItem(item);
    setShowForm(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const filterCount = activeFilterCount(filters);
  const totalCountSuffix = filteredItems.length === items.length
    ? ""
    : ` de ${items.length}`;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transações</Text>
          <Text style={styles.subtitle}>
            {filteredItems.length}
            {totalCountSuffix}{" "}
            registros
          </Text>
        </View>
        <Pressable
          style={[
            styles.filterToggle,
            showFilters && styles.filterToggleActive,
          ]}
          onPress={toggleFilters}
          hitSlop={6}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={showFilters ? colors.textInverse : colors.primary}
          />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg + 16 }}
          >
            {/* Date presets */}
            <Text style={styles.filterLabel}>Período</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {(
                [
                  { key: "today", label: "Hoje" },
                  { key: "week", label: "Semana" },
                  { key: "month", label: "Mês" },
                  { key: "year", label: "Ano" },
                  { key: "all", label: "Tudo" },
                ] as { key: DatePreset; label: string }[]
              ).map((p) => (
                <Pressable
                  key={p.key}
                  style={[
                    styles.chip,
                    filters.datePreset === p.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      datePreset: p.key,
                      dateFrom: "",
                      dateTo: "",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.datePreset === p.key && styles.chipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Custom date range */}
            <View style={styles.dateRangeRow}>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="De"
                  value={filters.dateFrom}
                  onChange={(v: string) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateFrom: v,
                      datePreset: "all",
                    }))
                  }
                  maxDate={filters.dateTo || undefined}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="Até"
                  value={filters.dateTo}
                  onChange={(v: string) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateTo: v,
                      datePreset: "all",
                    }))
                  }
                  minDate={filters.dateFrom || undefined}
                />
              </View>
            </View>

            {/* Type filter */}
            <Text style={styles.filterLabel}>Tipo</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: "ALL", label: "Todos" },
                  { key: "EXPENSE", label: "Saída" },
                  { key: "INCOME", label: "Entrada" },
                ] as { key: TransactionType | "ALL"; label: string }[]
              ).map((t) => (
                <Pressable
                  key={t.key}
                  style={[
                    styles.chip,
                    filters.type === t.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({ ...prev, type: t.key }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.type === t.key && styles.chipTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Value range */}
            <Text style={styles.filterLabel}>Valor (R$)</Text>
            <View style={styles.dateRangeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabelSm}>Mín</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.amountMin}
                  onChangeText={(v) =>
                    setFilters((prev) => ({ ...prev, amountMin: v }))
                  }
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabelSm}>Máx</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.amountMax}
                  onChangeText={(v) =>
                    setFilters((prev) => ({ ...prev, amountMax: v }))
                  }
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Categories */}
            {categories.length > 0 && (
              <>
                <Text style={styles.filterLabel}>Categorias</Text>
                <View style={styles.catGrid}>
                  {categories.map((cat) => {
                    const selected = filters.categoryIds.includes(cat.id);
                    return (
                      <Pressable
                        key={cat.id}
                        style={[
                          styles.catChip,
                          selected && {
                            backgroundColor: cat.color,
                            borderColor: cat.color,
                          },
                        ]}
                        onPress={() => toggleCategory(cat.id)}
                      >
                        <View
                          style={[
                            styles.catDot,
                            {
                              backgroundColor: selected
                                ? colors.textInverse
                                : cat.color,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.catChipText,
                            selected && { color: "#fff" },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Status */}
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.chipRow}>
              {([
                { key: "ALL", label: "Todos" },
                { key: "PAID", label: "Pago" },
                { key: "PENDING", label: "Pendente" },
                { key: "OVERDUE", label: "Atrasado" },
              ] as { key: TransactionStatus | "ALL"; label: string }[]).map((s) => (
                <Pressable
                  key={s.key}
                  style={[
                    styles.chip,
                    filters.status === s.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({ ...prev, status: s.key }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.status === s.key && styles.chipTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Payment Method */}
            <Text style={styles.filterLabel}>Pagamento</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {([
                { key: "ALL", label: "Todos" },
                { key: "CASH", label: "Dinheiro" },
                { key: "PIX", label: "Pix" },
                { key: "CREDIT_CARD", label: "Crédito" },
                { key: "DEBIT_CARD", label: "Débito" },
                { key: "BANK_TRANSFER", label: "Transferência" },
                { key: "BOLETO", label: "Boleto" },
                { key: "MERCADO_PAGO", label: "MP" },
                { key: "OTHER", label: "Outro" },
              ] as { key: PaymentMethod | "ALL"; label: string }[]).map((m) => (
                <Pressable
                  key={m.key}
                  style={[
                    styles.chip,
                    filters.paymentMethod === m.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({ ...prev, paymentMethod: m.key }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.paymentMethod === m.key && styles.chipTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Source */}
            <Text style={styles.filterLabel}>Origem</Text>
            <View style={styles.chipRow}>
              {([
                { key: "ALL", label: "Todas" },
                { key: "MANUAL", label: "Manual" },
                { key: "IMPORT", label: "Importado" },
                { key: "BANK_NOTIFICATION", label: "Notificação" },
              ] as { key: TransactionSource | "ALL"; label: string }[]).map((s) => (
                <Pressable
                  key={s.key}
                  style={[
                    styles.chip,
                    filters.source === s.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({ ...prev, source: s.key }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.source === s.key && styles.chipTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Search */}
            <Text style={styles.filterLabel}>Buscar</Text>
            <TextInput
              style={styles.filterInput}
              value={filters.searchText}
              onChangeText={(v) =>
                setFilters((prev) => ({ ...prev, searchText: v }))
              }
              placeholder="Descrição, categoria, notas..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Clear button */}
            {isFiltersActive(filters) && (
              <Pressable style={styles.clearBtn} onPress={clearFilters}>
                <Ionicons name="close-circle" size={16} color={colors.danger} />
                <Text style={styles.clearBtnText}>Limpar filtros</Text>
              </Pressable>
            )}
          </ScrollView>
          <ScrollFade height={16} fadeColor={colors.surface} />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={isFiltersActive(filters) ? "filter-outline" : "document-text-outline"}
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {isFiltersActive(filters)
                ? "Nenhum resultado"
                : "Nenhuma transação ainda"}
            </Text>
            <Text style={styles.emptyHint}>
              {isFiltersActive(filters)
                ? "Tente ajustar os filtros."
                : "Toque no botão + para adicionar a primeira."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isIncome = item.type === "INCOME";
          const statusColors: Record<string, string> = {
            PAID: colors.success,
            PENDING: colors.warning,
            OVERDUE: colors.danger,
          };
          const statusLabels: Record<string, string> = {
            PAID: "Pago",
            PENDING: "Pendente",
            OVERDUE: "Atrasado",
          };
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
          const itemSource = item.source ?? "MANUAL";
          return (
            <View style={styles.card}>
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor: isIncome
                      ? colors.incomeBg
                      : colors.expenseBg,
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
                    {item.description}
                  </Text>
                  {item.status !== "PAID" && (
                    <View style={[styles.statusBadge, { backgroundColor: (statusColors[item.status] ?? colors.textMuted) + "22" }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColors[item.status] ?? colors.textMuted }]}>
                        {statusLabels[item.status] ?? item.status}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>
                  {item.category?.name ?? "Sem categoria"} ·{" "}
                  {formatDate(item.date)}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name={paymentIcons[item.paymentMethod] ?? "cash-outline"} size={12} color={colors.textMuted} />
                    <Text style={styles.metaSmall}>
                      {item.paymentMethod === "CREDIT_CARD" ? "Crédito" : item.paymentMethod === "DEBIT_CARD" ? "Débito" : item.paymentMethod === "BANK_TRANSFER" ? "Transf." : item.paymentMethod === "MERCADO_PAGO" ? "MP" : item.paymentMethod === "OTHER" ? "Outro" : item.paymentMethod === "CASH" ? "Dinheiro" : item.paymentMethod}
                    </Text>
                  </View>
                  {itemSource !== "MANUAL" && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Ionicons name={sourceIcons[itemSource] ?? "hand-right-outline"} size={12} color={colors.textMuted} />
                      <Text style={styles.metaSmall}>{sourceLabels[itemSource] ?? itemSource}</Text>
                    </View>
                  )}
                  {item.bankOrigin && (
                    <Text style={styles.metaSmall}>· {item.bankOrigin}</Text>
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
                  {formatCurrency(item.amount)}
                </Text>
                <View style={styles.actionButtons}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleEdit(item)}
                    hitSlop={10}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleDelete(item)}
                    hitSlop={10}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => setShowForm(true)}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <TransactionForm
        visible={showForm}
        editingItem={editingItem}
        onClose={() => {
          setShowForm(false);
          setEditingItem(null);
        }}
        onSaved={() => {
          setShowForm(false);
          setEditingItem(null);
          fetchItems();
        }}
      />

      <ConfirmDialog
        visible={confirmDel !== null}
        title="Excluir transação"
        message={`Remover "${confirmDel?.item.description ?? ""}"?`}
        confirmText="Excluir"
        variant="danger"
        onCancel={() => setConfirmDel(null)}
        onConfirm={async () => {
          if (!confirmDel) return;
          try {
            await deleteTransaction(confirmDel.item.id);
            setConfirmDel(null);
            fetchItems();
          } catch {}
        }}
      />
      <ScrollFade />
    </SafeAreaView>
  );
}

interface FormProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingItem?: Transaction | null;
}

function TransactionForm({ visible, onClose, onSaved, editingItem }: FormProps) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [documentType, setDocumentType] = useState<DocumentType>("NORMAL");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [boletoNumber, setBoletoNumber] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string; variant?: "default" | "warning" | "danger" | "success" } | null>(null);
  const selectedDocumentMeta = documentTypeMeta[documentType];

  useEffect(() => {
    if (!visible) return;
    listCategories().then((cats) => {
      setCategories(cats);
      if (!editingItem && cats.length > 0) setCategoryId(cats[0].id);
    });
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (editingItem) {
      setDescription(editingItem.description);
      setAmount(formatCurrencyInput(Number(editingItem.amount)));
      setType(editingItem.type);
      setPaymentMethod(editingItem.paymentMethod);
      setDocumentType(editingItem.documentType);
      setDate(editingItem.date);
      setCategoryId(editingItem.categoryId);
      setBoletoNumber(editingItem.boletoNumber ?? "");
      setCnpj(editingItem.cnpj ?? "");
      setRecipientName(editingItem.recipientName ?? "");
      setExtraNotes(editingItem.notes ?? "");
      setDocumentNumber("");
      setPixKey("");
      setBankName("");
      setFineAmount("");
      setInterestAmount("");
      setDiscountAmount("");
    } else {
      setDescription("");
      setAmount("");
      setType("EXPENSE");
      setPaymentMethod("CASH");
      setDocumentType("NORMAL");
      setDate(toDateInputValue(new Date()));
      setCategoryId(null);
      setBoletoNumber("");
      setCnpj("");
      setRecipientName("");
      setDocumentNumber("");
      setPixKey("");
      setBankName("");
      setFineAmount("");
      setInterestAmount("");
      setDiscountAmount("");
      setExtraNotes("");
    }
  }, [editingItem, visible]);

  const handleDocumentTypeChange = (nextDocumentType: DocumentType) => {
    setDocumentType(nextDocumentType);
    const nextPaymentMethod = documentTypeMeta[nextDocumentType].paymentMethod;
    if (nextPaymentMethod) setPaymentMethod(nextPaymentMethod);
  };

  const buildNotes = () => {
    const detailLines = [
      documentNumber.trim() ? `Número do documento: ${documentNumber.trim()}` : null,
      pixKey.trim() ? `Chave PIX: ${pixKey.trim()}` : null,
      bankName.trim() ? `Banco/Instituição: ${bankName.trim()}` : null,
      fineAmount.trim() ? `Multa: ${fineAmount.trim()}` : null,
      interestAmount.trim() ? `Juros: ${interestAmount.trim()}` : null,
      discountAmount.trim() ? `Desconto: ${discountAmount.trim()}` : null,
      extraNotes.trim() || null,
    ].filter(Boolean);
    return detailLines.length > 0 ? detailLines.join("\n") : null;
  };

  const handlePhotoScan = async () => {
    try {
      const authed = await isAuthenticated();
      if (!authed) {
        setInfoDialog({ title: "Login necessário", message: "Faça login na aba Importar para usar o escaneamento por IA.", variant: "warning" });
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setInfoDialog({ title: "Permissão", message: "Precisamos de acesso à câmera para escanear recibos.", variant: "warning" });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.7,
        mediaTypes: ["images"],
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      setScanning(true);
      setErr(null);
      const asset = result.assets[0];
      const base64 = asset.base64 as string;
      const extracted = await extractTransactionFromPhoto(
        base64,
        asset.mimeType ?? "image/jpeg"
      );
      console.log("[Transactions] Dados extraídos:", JSON.stringify(extracted));
      setDescription(extracted.description);
      setAmount(formatCurrencyInput(extracted.amount));
      setType(extracted.type);
      setPaymentMethod(normalizePaymentMethod(extracted.paymentMethod));
      setDocumentType(extracted.documentType ?? "NORMAL");
      setDate(extracted.date);
      setBoletoNumber(extracted.boletoNumber ?? "");
      setCnpj(extracted.cnpj ?? "");
      setRecipientName(extracted.recipientName ?? "");
      setDocumentNumber(extracted.documentNumber ?? "");
      setPixKey(extracted.pixKey ?? "");
      setBankName(extracted.institution ?? "");
      setFineAmount(extracted.fineAmount != null ? formatCurrencyInput(extracted.fineAmount) : "");
      setInterestAmount(extracted.interestAmount != null ? formatCurrencyInput(extracted.interestAmount) : "");
      setDiscountAmount(extracted.discountAmount != null ? formatCurrencyInput(extracted.discountAmount) : "");
      setExtraNotes(extracted.notes ?? "");
      if (extracted.categoryName) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === extracted.categoryName!.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }
    } catch (error) {
      setInfoDialog({
        title: "Erro ao escanear",
        message: error instanceof Error ? error.message : "Falha ao processar imagem",
        variant: "danger",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseCurrencyInput(amount);
    if (!description.trim()) {
      setErr("Informe a descrição");
      return;
    }
    if (parsedAmount <= 0) {
      setErr("Informe um valor válido");
      return;
    }
    if (!categoryId) {
      setErr("Selecione uma categoria");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr("Data inválida (use AAAA-MM-DD)");
      return;
    }
    const notes = buildNotes();
    setErr(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateTransaction(editingItem.id, {
          description: description.trim(),
          amount: parsedAmount,
          type,
          paymentMethod,
          documentType,
          date,
          categoryId,
          notes,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
        });
      } else {
        await createTransaction({
          description: description.trim(),
          amount: parsedAmount,
          type,
          paymentMethod,
          documentType,
          date,
          categoryId,
          notes,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
        });
      }
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.formTitle}>{editingItem ? "Editar transação" : "Nova transação"}</Text>
            {!editingItem && (
              <Pressable onPress={handlePhotoScan} disabled={scanning} hitSlop={10}>
                {scanning ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={24} color={colors.primary} />
                )}
              </Pressable>
            )}
            {editingItem && <View style={{ width: 26 }} />}
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.typeRow}>
              <Pressable
                style={[
                  styles.typeButton,
                  type === "EXPENSE" && {
                    backgroundColor: colors.expenseBg,
                    borderColor: colors.expenseFg,
                  },
                ]}
                onPress={() => setType("EXPENSE")}
              >
                <Ionicons
                  name="arrow-down"
                  size={18}
                  color={
                    type === "EXPENSE" ? colors.expenseFg : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typeLabel,
                    type === "EXPENSE" && { color: colors.expenseFg },
                  ]}
                >
                  Despesa
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.typeButton,
                  type === "INCOME" && {
                    backgroundColor: colors.incomeBg,
                    borderColor: colors.incomeFg,
                  },
                ]}
                onPress={() => setType("INCOME")}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={
                    type === "INCOME" ? colors.incomeFg : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typeLabel,
                    type === "INCOME" && { color: colors.incomeFg },
                  ]}
                >
                  Receita
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Tipo de Documento</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.documentTypeRow}
              >
                {documentTypeOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.documentTypeCard,
                      documentType === option.value && { borderColor: option.color },
                    ]}
                    onPress={() => handleDocumentTypeChange(option.value)}
                  >
                    <View style={[styles.documentTypeIcon, { backgroundColor: `${option.color}22` }]}>
                      <Ionicons name={option.icon} size={18} color={option.color} />
                    </View>
                    <Text
                      style={[
                        styles.documentTypeTitle,
                        documentType === option.value && { color: option.color },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.documentTypeDescription}>{option.description}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={[styles.documentHint, { borderLeftColor: selectedDocumentMeta.color }]}>
                <Ionicons name={selectedDocumentMeta.icon} size={18} color={selectedDocumentMeta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.documentHintTitle}>{selectedDocumentMeta.label}</Text>
                  <Text style={styles.documentHintText}>{selectedDocumentMeta.description}</Text>
                </View>
              </View>
            </View>

            <Input
              label="Descrição"
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Mercado"
            />
            <Input
              label="Valor"
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            <DatePicker
              label="Data"
              value={date}
              onChange={setDate}
            />

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Método de Pagamento</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {[
                  { id: "CASH", label: "Dinheiro", icon: "cash-outline" },
                  { id: "PIX", label: "PIX", icon: "qr-code" },
                  { id: "CREDIT_CARD", label: "Crédito", icon: "card" },
                  { id: "DEBIT_CARD", label: "Débito", icon: "card" },
                  { id: "BOLETO", label: "Boleto", icon: "document-text" },
                  { id: "BANK_TRANSFER", label: "Transferência", icon: "swap-horizontal" },
                  { id: "MERCADO_PAGO", label: "Mercado Pago", icon: "logo-usd" },
                  { id: "OTHER", label: "Outro", icon: "ellipsis-horizontal" },
                ].map((method) => (
                  <Pressable
                    key={method.id}
                    style={[
                      styles.pill,
                      paymentMethod === method.id && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setPaymentMethod(method.id as PaymentMethod)}
                  >
                    <Ionicons
                      name={method.icon as any}
                      size={16}
                      color={paymentMethod === method.id ? colors.textInverse : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        paymentMethod === method.id && { color: colors.textInverse },
                      ]}
                    >
                      {method.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {documentType !== "NORMAL" && (
              <View style={styles.documentFieldsCard}>
                <Text style={styles.documentFieldsTitle}>Dados do documento</Text>

                {documentType === "BOLETO" && (
                  <>
                    <Input
                      label="Quem recebeu"
                      value={recipientName}
                      onChangeText={setRecipientName}
                      placeholder="Nome da empresa ou pessoa"
                      autoCapitalize="words"
                    />
                    <Input
                      label="Código de barras / linha digitável"
                      value={boletoNumber}
                      onChangeText={setBoletoNumber}
                      placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    <Input
                      label="CPF/CNPJ do beneficiário"
                      value={cnpj}
                      onChangeText={setCnpj}
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                    />
                    <View style={styles.documentFieldGrid}>
                      <Input label="Multa" value={fineAmount} onChangeText={setFineAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                      <Input label="Juros" value={interestAmount} onChangeText={setInterestAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                      <Input label="Desconto" value={discountAmount} onChangeText={setDiscountAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                    </View>
                  </>
                )}

                {documentType === "NOTA_FISCAL" && (
                  <>
                    <Input label="Emitente" value={recipientName} onChangeText={setRecipientName} placeholder="Empresa emissora" autoCapitalize="words" />
                    <Input label="CPF/CNPJ do emitente" value={cnpj} onChangeText={setCnpj} placeholder="000.000.000-00 ou 00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
                    <Input label="Número da nota" value={documentNumber} onChangeText={setDocumentNumber} placeholder="NF-e / cupom / série" autoCapitalize="characters" />
                  </>
                )}

                {documentType === "COMPROVANTE_PIX" && (
                  <>
                    <Input label="Pagador ou recebedor" value={recipientName} onChangeText={setRecipientName} placeholder="Nome da pessoa ou empresa" autoCapitalize="words" />
                    <Input label="CPF/CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="Documento se disponível" keyboardType="numbers-and-punctuation" />
                    <Input label="Chave PIX" value={pixKey} onChangeText={setPixKey} placeholder="CPF, e-mail, telefone ou chave aleatória" autoCapitalize="none" />
                  </>
                )}

                {documentType === "COMPROVANTE_BANCARIO" && (
                  <>
                    <Input label="Favorecido" value={recipientName} onChangeText={setRecipientName} placeholder="Nome do favorecido" autoCapitalize="words" />
                    <Input label="Banco / instituição" value={bankName} onChangeText={setBankName} placeholder="Ex: Nubank, Itaú, Inter" autoCapitalize="words" />
                    <Input label="CPF/CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="Documento se disponível" keyboardType="numbers-and-punctuation" />
                  </>
                )}

                {documentType === "OUTRO" && (
                  <>
                    <Input label="Identificação do documento" value={documentNumber} onChangeText={setDocumentNumber} placeholder="Número, protocolo ou referência" />
                    <Input label="Responsável" value={recipientName} onChangeText={setRecipientName} placeholder="Pessoa ou empresa relacionada" autoCapitalize="words" />
                  </>
                )}

                <Input
                  label="Observações do documento"
                  value={extraNotes}
                  onChangeText={setExtraNotes}
                  placeholder="Detalhes adicionais"
                  multiline
                  textAlignVertical="top"
                  style={styles.notesInput}
                />
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Categoria</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[
                      styles.pill,
                      categoryId === cat.id && {
                        backgroundColor: cat.color,
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() => setCategoryId(cat.id)}
                  >
                    <View
                      style={[styles.pillDot, { backgroundColor: cat.color }]}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        categoryId === cat.id && { color: colors.textInverse },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <Button title="Salvar" onPress={handleSave} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConfirmDialog
        visible={infoDialog !== null}
        title={infoDialog?.title ?? ""}
        message={infoDialog?.message ?? ""}
        confirmText="OK"
        cancelText=""
        variant={infoDialog?.variant ?? "default"}
        onCancel={() => setInfoDialog(null)}
        onConfirm={() => setInfoDialog(null)}
      />
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  filterToggle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
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
  filterBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },

  filterPanel: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    maxHeight: 340,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
    overflow: "hidden",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  filterLabelSm: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: "#fff",
  },
  dateRangeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 6,
  },
  filterInput: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },

  error: {
    marginHorizontal: spacing.lg,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.expenseBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1, paddingBottom: 96 },
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
  amount: { fontSize: 15, fontWeight: "700" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing["3xl"],
  },
  emptyText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  formContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  typeRow: { flexDirection: "row", gap: spacing.md },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  documentTypeRow: { gap: spacing.sm, paddingVertical: 2 },
  documentTypeCard: {
    width: 150,
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  documentTypeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  documentTypeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  documentTypeDescription: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
  },
  documentHint: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    backgroundColor: colors.surfaceElevated,
  },
  documentHintTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  documentHintText: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  documentFieldsCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  documentFieldsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  documentFieldGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  documentGridInput: {
    minWidth: 92,
  },
  notesInput: {
    minHeight: 86,
    paddingTop: 12,
  },
  pillRow: { gap: spacing.sm, paddingVertical: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontSize: 13, color: colors.textPrimary, fontWeight: "500" },
  actionButtons: { flexDirection: "row", gap: 4 },
  actionButton: {
    padding: 6,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  metaSmall: {
    fontSize: 11,
    color: colors.textMuted,
  },
  });
}

