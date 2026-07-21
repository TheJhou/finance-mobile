import { DatePicker } from "@/components/date-picker";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category, PaymentMethod, TransactionSource, TransactionStatus, TransactionType } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View, Platform } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type DatePreset = "today" | "week" | "month" | "year" | "all";

export interface Filters {
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

export const INITIAL_FILTERS: Filters = {
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

export function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === "all") return null;
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  switch (preset) {
    case "today":
      from = to;
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      from = d.toISOString().slice(0, 10);
      break;
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = d.toISOString().slice(0, 10);
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

export function isFiltersActive(f: Filters): boolean {
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

export function activeFilterCount(f: Filters): number {
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

interface TransactionFiltersProps {
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
  readonly categories: readonly Category[];
  readonly visible: boolean;
  readonly hideType?: boolean;
  readonly hideStatus?: boolean;
}

export function TransactionFilters({ filters, onChange, categories, visible, hideType, hideStatus }: TransactionFiltersProps) {
  if (!visible) return null;

  const toggleCategory = (id: string) => {
    onChange({
      ...filters,
      categoryIds: filters.categoryIds.includes(id)
        ? filters.categoryIds.filter((c) => c !== id)
        : [...filters.categoryIds, id],
    });
  };

  const clearFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onChange(INITIAL_FILTERS);
  };

  return (
    <View style={styles.filterPanel}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg + 16 }}
      >
        <Text style={styles.filterLabel}>Período</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([
            { key: "today", label: "Hoje" },
            { key: "week", label: "Semana" },
            { key: "month", label: "Mês" },
            { key: "year", label: "Ano" },
            { key: "all", label: "Tudo" },
          ] as { key: DatePreset; label: string }[]).map((p) => (
            <Pressable
              key={p.key}
              style={[styles.chip, filters.datePreset === p.key && styles.chipActive]}
              onPress={() => onChange({ ...filters, datePreset: p.key, dateFrom: "", dateTo: "" })}
            >
              <Text style={[styles.chipText, filters.datePreset === p.key && styles.chipTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.dateRangeRow}>
          <View style={{ flex: 1 }}>
            <DatePicker
              label="De"
              value={filters.dateFrom}
              onChange={(v: string) => onChange({ ...filters, dateFrom: v, datePreset: "all" })}
              maxDate={filters.dateTo || undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DatePicker
              label="Até"
              value={filters.dateTo}
              onChange={(v: string) => onChange({ ...filters, dateTo: v, datePreset: "all" })}
              minDate={filters.dateFrom || undefined}
            />
          </View>
        </View>

        {!hideType && (
          <>
            <Text style={styles.filterLabel}>Tipo</Text>
            <View style={styles.chipRow}>
              {([
                { key: "ALL", label: "Todos" },
                { key: "EXPENSE", label: "Saída" },
                { key: "INCOME", label: "Entrada" },
              ] as { key: TransactionType | "ALL"; label: string }[]).map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.chip, filters.type === t.key && styles.chipActive]}
                  onPress={() => onChange({ ...filters, type: t.key })}
                >
                  <Text style={[styles.chipText, filters.type === t.key && styles.chipTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.filterLabel}>Valor (R$)</Text>
        <View style={styles.dateRangeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filterLabelSm}>Mín</Text>
            <TextInput
              style={styles.filterInput}
              value={filters.amountMin}
              onChangeText={(v) => onChange({ ...filters, amountMin: v })}
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
              onChangeText={(v) => onChange({ ...filters, amountMax: v })}
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

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
                      selected && { backgroundColor: cat.color, borderColor: cat.color },
                    ]}
                    onPress={() => toggleCategory(cat.id)}
                  >
                    <View style={[styles.catDot, { backgroundColor: selected ? colors.textInverse : cat.color }]} />
                    <Text style={[styles.catChipText, selected && { color: "#fff" }]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {!hideStatus && (
          <>
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
                  style={[styles.chip, filters.status === s.key && styles.chipActive]}
                  onPress={() => onChange({ ...filters, status: s.key })}
                >
                  <Text style={[styles.chipText, filters.status === s.key && styles.chipTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.filterLabel}>Pagamento</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
              style={[styles.chip, filters.paymentMethod === m.key && styles.chipActive]}
              onPress={() => onChange({ ...filters, paymentMethod: m.key })}
            >
              <Text style={[styles.chipText, filters.paymentMethod === m.key && styles.chipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

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
              style={[styles.chip, filters.source === s.key && styles.chipActive]}
              onPress={() => onChange({ ...filters, source: s.key })}
            >
              <Text style={[styles.chipText, filters.source === s.key && styles.chipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.filterLabel}>Buscar</Text>
        <TextInput
          style={styles.filterInput}
          value={filters.searchText}
          onChangeText={(v) => onChange({ ...filters, searchText: v })}
          placeholder="Descrição, categoria, notas..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {isFiltersActive(filters) && (
          <Pressable style={styles.clearBtn} onPress={clearFilters}>
            <Ionicons name="close-circle" size={16} color={colors.danger} />
            <Text style={styles.clearBtnText}>Limpar filtros</Text>
          </Pressable>
        )}
      </ScrollView>
      <ScrollFade fadeColor={colors.surface} />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
