import { DatePicker } from "@/components/date-picker";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { exportDreCSV, exportDrePDF, exportDreXLSX } from "@/lib/export";
import type { DreData, DrePeriod, DrePeriodRange } from "@/lib/repositories/dre";
import { buildPeriodRange, getDreData } from "@/lib/repositories/dre";
import { getCachedMonthStartDay, getCurrentPeriod, loadMonthStartDay } from "@/lib/settings";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - spacing.lg * 2 - spacing.lg * 2 - 16;

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: DrePeriod; label: string }[] = [
  { key: "month", label: "Mês" },
  { key: "quarter", label: "Trimestre" },
  { key: "semester", label: "Semestre" },
  { key: "year", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  name,
  color,
  amount,
  total,
  type,
}: {
  name: string;
  color: string;
  amount: number;
  total: number;
  type: "income" | "expense";
}) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <View style={styles.categoryRow}>
      <View style={[styles.categoryDot, { backgroundColor: color }]} />
      <View style={styles.categoryInfo}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{name}</Text>
          <Text style={[styles.categoryAmount, { color: type === "income" ? colors.incomeFg : colors.expenseFg }]}>
            {formatCurrency(amount)}
          </Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.categoryPct}>{pct}%</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function DreScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [selectedPeriod, setSelectedPeriod] = useState<DrePeriod>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [data, setData] = useState<DreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Período financeiro (respeita o dia de início do mês), não o mês do calendário
  const [selectedYear, setSelectedYear] = useState(() => getCurrentPeriod().year);
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentPeriod().month);
  const [monthStartDay, setMonthStartDay] = useState(getCachedMonthStartDay);
  const userNavigatedRef = useRef(false);

  // O estado inicial usou o dia de início em cache; ao carregar o configurado,
  // corrige o período atual se o usuário ainda não navegou.
  useEffect(() => {
    loadMonthStartDay().then((startDay) => {
      setMonthStartDay(startDay);
      if (userNavigatedRef.current) return;
      const current = getCurrentPeriod(startDay);
      setSelectedYear(current.year);
      setSelectedMonth(current.month);
    });
  }, []);
  const [period, setPeriod] = useState<DrePeriodRange>(buildPeriodRange("month"));
  const periodRef = useRef<DrePeriodRange>(period);
  const { alert, dialog } = useAppDialog();

  const fetchData = useCallback(async (p?: DrePeriodRange) => {
    try {
      setError(null);
      const activePeriod = p ?? periodRef.current;
      const result = await getDreData(activePeriod);
      setData(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[DRE] fetchData error:", msg);
      setError(msg.includes("database") || msg.includes("SQL") ? "Erro no banco de dados. Reinicie o app se persistir." : `Erro: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const rebuildPeriod = useCallback(async (type: DrePeriod, from?: string, to?: string) => {
    const startDay = await loadMonthStartDay();
    const p = buildPeriodRange(type, from, to, { year: selectedYear, month: selectedMonth, monthStartDay: startDay });
    periodRef.current = p;
    setPeriod(p);
    return p;
  }, [selectedYear, selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      rebuildPeriod(selectedPeriod).then(p => fetchData(p));
    }, [fetchData, rebuildPeriod, selectedPeriod])
  );

  function selectPeriod(key: DrePeriod) {
    if (key === "custom") {
      setShowCustomModal(true);
      return;
    }
    setSelectedPeriod(key);
    setLoading(true);
    rebuildPeriod(key).then(p => fetchData(p));
  }

  function applyCustomPeriod() {
    if (!customFrom || !customTo) {
      alert("Período inválido", "Preencha as datas de início e fim.", { variant: "danger" });
      return;
    }
    if (customFrom > customTo) {
      alert("Período inválido", "A data inicial deve ser anterior à data final.", { variant: "danger" });
      return;
    }
    setSelectedPeriod("custom");
    setShowCustomModal(false);
    const p = buildPeriodRange("custom", customFrom, customTo);
    periodRef.current = p;
    setPeriod(p);
    setLoading(true);
    fetchData(p);
  }

  function changeMonth(delta: number) {
    userNavigatedRef.current = true;
    const next = new Date(selectedYear, selectedMonth + delta, 1);
    setSelectedMonth(next.getMonth());
    setSelectedYear(next.getFullYear());
  }

  // Rebuild period and fetch when month/year changes (not custom period)
  useEffect(() => {
    if (selectedPeriod === "custom") return;
    let cancelled = false;
    setLoading(true);
    rebuildPeriod(selectedPeriod).then(p => {
      if (!cancelled) fetchData(p);
    });
    return () => { cancelled = true; };
  }, [selectedMonth, selectedYear, selectedPeriod, rebuildPeriod, fetchData]);

  async function handleExport(format: "csv" | "xlsx" | "pdf") {
    if (!data) return;
    setShowExportModal(false);
    setExporting(true);
    try {
      if (format === "csv") await exportDreCSV(data);
      else if (format === "xlsx") await exportDreXLSX(data);
      else await exportDrePDF(data);
    } catch (e) {
      alert("Erro ao exportar", "Não foi possível gerar o arquivo. Tente novamente.", { variant: "danger" });
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  // ─── Bar chart data ───────────────────────────────────────────────────────

  const barData =
    data?.monthlyEvolution.flatMap((m) => [
      {
        value: m.income,
        label: m.month.slice(5),
        frontColor: colors.incomeFg,
        spacing: 2,
        labelTextStyle: { color: colors.textMuted, fontSize: 10 },
      },
      {
        value: m.expense,
        frontColor: colors.expenseFg,
        spacing: 18,
        labelTextStyle: { color: colors.textMuted, fontSize: 10 },
      },
    ]) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────

  const currentPeriod = getCurrentPeriod(monthStartDay);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Relatório / DRE</Text>
          <Text style={styles.headerSubtitle}>{period.label}</Text>
        </View>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => setShowExportModal(true)}
          disabled={!data || exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodContainer}>
        {PERIOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.periodChip, selectedPeriod === opt.key && styles.periodChipActive]}
            onPress={() => selectPeriod(opt.key)}
          >
            <Text style={[styles.periodChipText, selectedPeriod === opt.key && styles.periodChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Month selector */}
      {selectedPeriod !== "custom" && (
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthSelectorText}>
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </TouchableOpacity>
          {!(selectedYear === currentPeriod.year && selectedMonth === currentPeriod.month) && (
            <TouchableOpacity style={styles.todayBtn} onPress={() => {
              setSelectedMonth(currentPeriod.month);
              setSelectedYear(currentPeriod.year);
            }}>
              <Text style={styles.todayBtnText}>Hoje</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchData(); }}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderColor: colors.incomeFg + "33" }]}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.incomeBg }]}>
                <Ionicons name="trending-up-outline" size={18} color={colors.incomeFg} />
              </View>
              <Text style={styles.summaryLabel}>Receitas</Text>
              <Text style={[styles.summaryValue, { color: colors.incomeFg }]}>
                {formatCurrency(data?.totalIncome ?? 0)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: colors.expenseFg + "33" }]}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.expenseBg }]}>
                <Ionicons name="trending-down-outline" size={18} color={colors.expenseFg} />
              </View>
              <Text style={styles.summaryLabel}>Despesas</Text>
              <Text style={[styles.summaryValue, { color: colors.expenseFg }]}>
                {formatCurrency(data?.totalExpense ?? 0)}
              </Text>
            </View>
          </View>

          {/* Net result */}
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor:
                  (data?.netResult ?? 0) >= 0 ? colors.incomeBg + "55" : colors.expenseBg + "55",
                borderColor: (data?.netResult ?? 0) >= 0 ? colors.incomeFg + "44" : colors.expenseFg + "44",
              },
            ]}
          >
            <Text style={styles.resultLabel}>Resultado Líquido</Text>
            <Text
              style={[
                styles.resultValue,
                { color: (data?.netResult ?? 0) >= 0 ? colors.incomeFg : colors.expenseFg },
              ]}
            >
              {formatCurrency(data?.netResult ?? 0)}
            </Text>
            <Text style={styles.resultPeriod}>{period.label}</Text>
          </View>

          {/* Bar chart */}
          {barData.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Receitas × Despesas por Mês</Text>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.incomeFg }]} />
                  <Text style={styles.legendText}>Receitas</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.expenseFg }]} />
                  <Text style={styles.legendText}>Despesas</Text>
                </View>
              </View>
              <BarChart
                data={barData}
                barWidth={12}
                spacing={2}
                roundedTop
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                noOfSections={4}
                maxValue={Math.max(
                  ...(data?.monthlyEvolution.flatMap((m) => [m.income, m.expense]) ?? [1]),
                  1
                ) * 1.1}
                isAnimated
                hideRules={false}
                rulesColor={colors.border}
                backgroundColor="transparent"
                width={CHART_WIDTH}
              />
            </View>
          )}

          {/* Income by category */}
          {(data?.incomeByCategory.length ?? 0) > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Receitas por Categoria</Text>
              {data!.incomeByCategory.map((row) => (
                <CategoryRow
                  key={row.categoryName}
                  name={row.categoryName}
                  color={row.categoryColor}
                  amount={row.total}
                  total={data!.totalIncome}
                  type="income"
                />
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Receitas</Text>
                <Text style={[styles.totalValue, { color: colors.incomeFg }]}>
                  {formatCurrency(data!.totalIncome)}
                </Text>
              </View>
            </View>
          )}

          {/* Expense by category */}
          {(data?.expenseByCategory.length ?? 0) > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Despesas por Categoria</Text>
              {data!.expenseByCategory.map((row) => (
                <CategoryRow
                  key={row.categoryName}
                  name={row.categoryName}
                  color={row.categoryColor}
                  amount={row.total}
                  total={data!.totalExpense}
                  type="expense"
                />
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Despesas</Text>
                <Text style={[styles.totalValue, { color: colors.expenseFg }]}>
                  {formatCurrency(data!.totalExpense)}
                </Text>
              </View>
            </View>
          )}

          {/* Monthly evolution table */}
          {(data?.monthlyEvolution.length ?? 0) > 1 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Evolução Mensal</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Mês</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: "right" }]}>Receitas</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: "right" }]}>Despesas</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: "right" }]}>Resultado</Text>
              </View>
              {data!.monthlyEvolution.map((row) => (
                <View key={row.month} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.2 }]}>{row.month}</Text>
                  <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", color: colors.incomeFg }]}>
                    {formatCurrency(row.income)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", color: colors.expenseFg }]}>
                    {formatCurrency(row.expense)}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      { flex: 1.5, textAlign: "right", color: row.result >= 0 ? colors.incomeFg : colors.expenseFg },
                    ]}
                  >
                    {formatCurrency(row.result)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(data?.totalIncome === 0 && data?.totalExpense === 0) && (
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhuma transação</Text>
              <Text style={styles.emptySubtitle}>Não há transações pagas no período selecionado.</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Custom period modal */}
      <Modal visible={showCustomModal} transparent animationType="slide" onRequestClose={() => setShowCustomModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCustomModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Período Personalizado</Text>
            <DatePicker
              label="Data inicial"
              value={customFrom}
              onChange={setCustomFrom}
              maxDate={customTo || undefined}
            />
            <DatePicker
              label="Data final"
              value={customTo}
              onChange={setCustomTo}
              minDate={customFrom || undefined}
            />
            <TouchableOpacity style={styles.applyBtn} onPress={applyCustomPeriod}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Export modal */}
      <Modal visible={showExportModal} transparent animationType="slide" onRequestClose={() => setShowExportModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowExportModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Exportar Relatório</Text>
            <Text style={styles.modalSubtitle}>{period.label}</Text>

            <TouchableOpacity style={styles.exportOptionBtn} onPress={() => handleExport("csv")}>
              <View style={[styles.exportOptionIcon, { backgroundColor: colors.incomeFg + "22" }]}>
                <Ionicons name="document-text-outline" size={22} color={colors.incomeFg} />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>CSV</Text>
                <Text style={styles.exportOptionDesc}>Planilha simples, compatível com qualquer editor</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportOptionBtn} onPress={() => handleExport("xlsx")}>
              <View style={[styles.exportOptionIcon, { backgroundColor: colors.incomeFg + "22" }]}>
                <Ionicons name="grid-outline" size={22} color={colors.incomeFg} />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>Excel (.xlsx)</Text>
                <Text style={styles.exportOptionDesc}>DRE + Evolução + Transações em abas separadas</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.exportOptionBtn} onPress={() => handleExport("pdf")}>
              <View style={[styles.exportOptionIcon, { backgroundColor: colors.expenseFg + "22" }]}>
                <Ionicons name="document-outline" size={22} color={colors.expenseFg} />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>PDF</Text>
                <Text style={styles.exportOptionDesc}>Relatório formatado para impressão ou compartilhamento</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExportModal(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      {dialog}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles() {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
  },
  retryText: {
    color: colors.primary,
    fontWeight: "600",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  exportBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },

  // Period chips
  periodScroll: {
    maxHeight: 48,
  },
  periodContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary + "22",
    borderColor: colors.primary,
  },
  periodChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  periodChipTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },

  // Month selector
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  monthSelectorText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  todayBtn: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary + "22",
    borderRadius: radius.full,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },

  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    rowGap: spacing.md,
  },

  // Summary cards
  summaryRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 4,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },

  // Result card
  resultCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  resultLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  resultPeriod: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },

  // Chart legend
  chartLegend: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Category row
  categoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryName: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  categoryAmount: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressBg: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    maxWidth: "100%",
  },
  categoryPct: {
    fontSize: 10,
    color: colors.textMuted,
  },

  // Total row
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "800",
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "55",
  },
  tableCell: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing["2xl"],
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 0,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: -spacing.xs,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: 14,
  },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: 4,
  },
  applyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // Export options
  exportOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  exportOptionInfo: {
    flex: 1,
  },
  exportOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  exportOptionDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  cancelBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  });
}
