import { HorizontalScrollFade, ScrollFade } from "@/components/ui/scroll-fade";
import { isAuthenticated } from "@/lib/auth";
import type { AiForecast, GoalData, ScoreData, StreakData } from "@/lib/backend";
import { checkinStreak, getAiForecast, getDashboardScore, getGoals, getStreak } from "@/lib/backend";
import { calculateHealthScore } from "@/lib/health-score";
import { scheduleDailyCommitmentCheck, scheduleGoalAlerts, scheduleUpcomingBillsAlerts } from "@/lib/notifications/scheduler";
import type { UpcomingBill } from "@/lib/repositories/dashboard";
import { getCurrentPeriod, getDashboard, getFutureBills, getUpcomingBills } from "@/lib/repositories/dashboard";
import { processRecurringDue } from "@/lib/repositories/recurring";
import { loadMonthStartDay } from "@/lib/settings";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { getTokenLimitStatus, resetTokenLimitStatus } from "@/lib/token-limit";
import type { DashboardData, HealthScoreResult } from "@/lib/types";
import { formatCurrency, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { AlertIcon } from "@/components/icons/AlertIcon";
import { CalendarIcon } from "@/components/icons/CalendarIcon";
import { CreditCardIcon } from "@/components/icons/CreditCardIcon";
import { HourglassDoneIcon } from "@/components/icons/HourglassDoneIcon";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle as SvgCircle } from "react-native-svg";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_PADDING = spacing.lg;
const HALF_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - spacing.md) / 2;

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function CircularProgress({
  size,
  strokeWidth,
  progress,
  progressColor,
  bgColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  progressColor: string;
  bgColor?: string;
  children?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(progress, 1));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={bgColor || colors.border} strokeWidth={strokeWidth} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={progressColor} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState<DashboardData | null>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [futureBills, setFutureBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenLimitStatus, setTokenLimitStatus] = useState(getTokenLimitStatus());
  const [chartModal, setChartModal] = useState<"category" | "bar" | "line" | "commitment" | null>(null);
  const [notificationsScheduled, setNotificationsScheduled] = useState(false);
  const [aiForecast, setAiForecast] = useState<AiForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  // Período financeiro (respeita o dia de início do mês), não o mês do calendário
  const [selectedYear, setSelectedYear] = useState(() => getCurrentPeriod().year);
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentPeriod().month);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const userNavigatedRef = useRef(false);

  const selectPeriod = useCallback((year: number, month: number, byUser: boolean) => {
    if (byUser) userNavigatedRef.current = true;
    const normalized = new Date(year, month, 1);
    setSelectedYear(normalized.getFullYear());
    setSelectedMonth(normalized.getMonth());
  }, []);

  const fetchingRef = useRef(false);
  const fetchIdRef = useRef(0);
  const lastFetchRef = useRef(0);
  const lastFetchedMonthRef = useRef(-1);
  const lastFetchedYearRef = useRef(-1);

  const AI_FORECAST_KEY = "ai_forecast_cache";

  const loadAiForecast = useCallback(async (dashData: DashboardData) => {
    try {
      const authed = await isAuthenticated();
      if (!authed) {
        setAiForecast(null);
        return;
      }
      const today = toDateInputValue(new Date());
      const cached = await AsyncStorage.getItem(AI_FORECAST_KEY);
      if (cached) {
        const parsed: AiForecast = JSON.parse(cached);
        if (parsed.generatedAt === today) {
          setAiForecast(parsed);
          return;
        }
      }
      setForecastLoading(true);
      const forecast = await getAiForecast({
        balance: dashData.balance,
        monthlyIncome: dashData.monthlyIncome,
        monthlyExpense: dashData.monthlyExpense,
        upcomingAmount: dashData.upcomingAmount,
        overdueAmount: dashData.overdueAmount,
        activeRecurring: dashData.activeRecurring,
        expensesByCategory: dashData.expensesByCategory,
        monthlyTrend: dashData.monthlyTrend,
      });
      setAiForecast(forecast);
      await AsyncStorage.setItem(AI_FORECAST_KEY, JSON.stringify(forecast));
    } catch (err) {
      console.warn("[Dashboard] Falha ao buscar previsão IA:", err);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    const monthChanged = lastFetchedMonthRef.current !== selectedMonth || lastFetchedYearRef.current !== selectedYear;
    // Only skip if a fetch is already in progress AND month hasn't changed AND not refreshing
    if (fetchingRef.current && !refreshing && !monthChanged) return;
    fetchingRef.current = true;
    const fetchId = ++fetchIdRef.current;
    lastFetchRef.current = Date.now();

    try {
      // Load month start day setting
      const startDay = await loadMonthStartDay();
      if (fetchIdRef.current !== fetchId) return;
      setMonthStartDay(startDay);

      // O estado inicial usou o dia de início em cache; se o configurado muda o
      // período atual, corrige (a mudança de mês dispara um novo fetch).
      if (!userNavigatedRef.current) {
        const current = getCurrentPeriod(startDay);
        if (current.year !== selectedYear || current.month !== selectedMonth) {
          selectPeriod(current.year, current.month, false);
          return;
        }
      }

      // Process due recurring transactions so next_due_date is current before fetching bills
      await processRecurringDue();
      if (fetchIdRef.current !== fetchId) return;

      const [dashRes, billsRes, futureRes] = await Promise.all([
        getDashboard({ year: selectedYear, month: selectedMonth, monthStartDay: startDay }),
        getUpcomingBills({ year: selectedYear, month: selectedMonth, monthStartDay: startDay }),
        getFutureBills({ limit: 10 }),
      ]);
      if (fetchIdRef.current !== fetchId) return;
      setData(dashRes);
      setBills(billsRes);
      setFutureBills(futureRes);
      lastFetchedMonthRef.current = selectedMonth;
      lastFetchedYearRef.current = selectedYear;

      // AI Forecast (1x por dia, non-blocking)
      void loadAiForecast(dashRes);

      // Backend calls serialized with delays to avoid rate limiting
      const currentTokenStatus = getTokenLimitStatus();
      if (fetchIdRef.current !== fetchId) return;
      setTokenLimitStatus(currentTokenStatus);

      if (!currentTokenStatus.exceeded) {
        const [goalsRes, streakRes, scoreRes] = await Promise.allSettled([
          getGoals(),
          getStreak(),
          getDashboardScore(),
        ]);
        if (fetchIdRef.current !== fetchId) return;
        if (goalsRes.status === "fulfilled") setGoals(goalsRes.value);
        if (streakRes.status === "fulfilled") setStreak(streakRes.value);
        if (scoreRes.status === "fulfilled") setScore(scoreRes.value);
        try { await checkinStreak(); } catch (err) { console.warn("[Dashboard] Falha ao registrar streak:", err); }
      } else {
        console.warn("[Dashboard] Pulando chamadas backend: limite de tokens atingido");
      }

      // Schedule notifications apenas uma vez por sessao (evita spam)
      if (!notificationsScheduled) {
        const comprometimento = dashRes.monthlyIncome > 0 ? Math.round((dashRes.monthlyExpense / dashRes.monthlyIncome) * 100) : 0;
        void Promise.all([
          scheduleUpcomingBillsAlerts().catch((err) => console.warn("[Dashboard] Falha ao agendar contas:", err)),
          scheduleGoalAlerts().catch((err) => console.warn("[Dashboard] Falha ao agendar metas:", err)),
          scheduleDailyCommitmentCheck(comprometimento).catch((err) => console.warn("[Dashboard] Falha ao agendar comprometimento:", err)),
        ]).then(() => setNotificationsScheduled(true));
      }

      setError(null);
    } catch (err) {
      if (fetchIdRef.current !== fetchId) return;
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      if (fetchIdRef.current === fetchId) {
        fetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [refreshing, notificationsScheduled, selectedYear, selectedMonth, loadAiForecast, selectPeriod]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Re-fetch when month/year changes while screen is focused
  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    resetTokenLimitStatus();
    setTokenLimitStatus(getTokenLimitStatus());
    setNotificationsScheduled(false); // Permitir reagendamento no refresh
    fetchData();
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

  const pieColors = [colors.primary, "#f472b6", colors.info, colors.warning, colors.success, "#fb923c"];

  // Use selected month for comparison, not always the real current month
  const currentPeriod = getCurrentPeriod(monthStartDay);
  const selectedMonthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const prevMonthDate = new Date(selectedYear, selectedMonth - 1, 1);
  const prevMonthStr = toDateInputValue(prevMonthDate).slice(0, 7);

  const economia = data ? data.monthlyIncome - data.monthlyExpense : 0;
  const economiaPercent = data && data.monthlyIncome > 0 ? Math.round((economia / data.monthlyIncome) * 100) : 0;
  const comprometimento = data && data.monthlyIncome > 0 ? Math.round((data.monthlyExpense / data.monthlyIncome) * 100) : 0;
  const healthScoreData: HealthScoreResult | null = data
    ? calculateHealthScore(
        data,
        streak ? { streak: streak.streak, todayRegistered: streak.todayRegistered, totalDays: streak.totalDays } : null,
        goals.map((g) => ({
          name: g.name,
          targetValue: g.targetValue,
          savedValue: g.savedValue,
          progress: g.progress,
          remaining: g.remaining,
          deadline: g.deadline,
        })),
        bills.map((b) => ({ name: b.name, amount: b.amount, date: b.date })),
        selectedMonthStr
      )
    : null;
  const healthScore = healthScoreData?.overall ?? 0;
  const prevMonth = data ? data.monthlyTrend.find((m: { month: string; income: number; expense: number }) => m.month === prevMonthStr) ?? null : null;
  const incomeChange = prevMonth && prevMonth.income > 0 ? Math.round(((data!.monthlyIncome - prevMonth.income) / prevMonth.income) * 100) : null;
  const expenseChange = prevMonth && prevMonth.expense > 0 ? Math.round(((data!.monthlyExpense - prevMonth.expense) / prevMonth.expense) * 100) : null;
  const currentMonthTrend = data ? data.monthlyTrend.find((m: { month: string; income: number; expense: number }) => m.month === selectedMonthStr) : null;
  const balanceChange = currentMonthTrend && prevMonth
    ? (() => { const recentNet = currentMonthTrend.income - currentMonthTrend.expense; const prevNet = prevMonth.income - prevMonth.expense; return prevNet !== 0 ? Math.round(((recentNet - prevNet) / Math.abs(prevNet)) * 100) : null; })()
    : null;
  const receivablesChange = data && data.prevPendingReceivables > 0
    ? Math.round(((data.pendingReceivables - data.prevPendingReceivables) / data.prevPendingReceivables) * 100)
    : null;
  const payablesChange = data && data.prevPendingPayables > 0
    ? Math.round(((data.pendingPayables - data.prevPendingPayables) / data.prevPendingPayables) * 100)
    : null;
  const totalExpense = data ? data.monthlyExpense || 1 : 1;
  const dailyExpenseChartData = data && data.expenseTrend.length > 0
    ? data.expenseTrend.map((item: { label: string; value: number }) => ({ label: item.label, value: item.value, frontColor: colors.chartBar1 }))
    : [{ label: "-", value: 0, frontColor: colors.chartBar1 }];
  const netTrendChartData = data && data.monthlyTrend.length > 0
    ? data.monthlyTrend.map((m: { month: string; income: number; expense: number }) => ({ label: m.month.slice(5), value: m.income - m.expense }))
    : [{ value: 0, label: "-" }];

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Month selector ── */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => selectPeriod(selectedYear, selectedMonth - 1, true)}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthSelectorText}>
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </Text>
          <TouchableOpacity
            onPress={() => selectPeriod(selectedYear, selectedMonth + 1, true)}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </TouchableOpacity>
          {!(selectedYear === currentPeriod.year && selectedMonth === currentPeriod.month) && (
            <TouchableOpacity style={styles.todayBtn} onPress={() => selectPeriod(currentPeriod.year, currentPeriod.month, false)}>
              <Text style={styles.todayBtnText}>Hoje</Text>
            </TouchableOpacity>
          )}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Token limit warning banner */}
        {tokenLimitStatus.exceeded && (
          <View style={styles.tokenLimitBanner}>
            <Ionicons name="warning" size={20} color="#f59e0b" />
            <Text style={styles.tokenLimitText}>{tokenLimitStatus.message}</Text>
            <TouchableOpacity 
              style={styles.tokenLimitButton}
              onPress={() => router.push("/(app)/plan")}
            >
              <Text style={styles.tokenLimitButtonText}>Ver Plano</Text>
            </TouchableOpacity>
          </View>
        )}

        {data && (
          <>
            {/* ── Saldo do mês + Caixa ── */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeaderRow}>
                <Text style={styles.balanceLabel}>Resumo financeiro</Text>
                <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
              </View>
              <View style={styles.balanceDualRow}>
                <View style={styles.balanceDualItem}>
                  <Text style={styles.balanceDualLabel}>Saldo do mês</Text>
                  <Text style={[styles.balanceDualValue, { color: (data.monthlyIncome - data.monthlyExpense) >= 0 ? colors.success : colors.danger }]}>
                    {formatCurrency(data.monthlyIncome - data.monthlyExpense)}
                  </Text>
                </View>
                <View style={styles.balanceDualDivider} />
                <View style={styles.balanceDualItem}>
                  <Text style={styles.balanceDualLabel}>Caixa</Text>
                  <Text style={styles.balanceDualValue}>{formatCurrency(data.balance)}</Text>
                </View>
              </View>
              <View style={styles.balanceSubRow}>
                <View>
                  <Text style={styles.balanceSubLabel}>Receitas do mês</Text>
                  <Text style={[styles.balanceSubValue, { color: colors.success }]}>{formatCurrency(data.monthlyIncome)}</Text>
                </View>
                <View>
                  <Text style={styles.balanceSubLabel}>Gastos do mês</Text>
                  <Text style={[styles.balanceSubValue, { color: colors.danger }]}>{formatCurrency(data.monthlyExpense)}</Text>
                </View>
              </View>
              <View style={[styles.balanceSubRow, { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View>
                  <Text style={styles.balanceSubLabel}>A receber</Text>
                  <Text style={[styles.balanceSubValue, { color: colors.success }]}>{formatCurrency(data.pendingReceivables)}</Text>
                </View>
                <View>
                  <Text style={styles.balanceSubLabel}>A pagar</Text>
                  <Text style={[styles.balanceSubValue, { color: colors.danger }]}>{formatCurrency(data.pendingPayables)}</Text>
                </View>
              </View>
            </View>

            {/* ── 4 Summary Mini-Cards (horizontal scroll) ── */}
            <HorizontalScrollFade showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -CARD_PADDING }} contentContainerStyle={{ paddingHorizontal: CARD_PADDING, gap: spacing.md }}>
              {/* Receitas */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.incomeBg }]}>
                  <Ionicons name="arrow-down" size={16} color={colors.success} />
                </View>
                <Text style={styles.miniCardLabel}>Receitas</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.monthlyIncome)}</Text>
                <Text style={styles.miniCardSub}>Este mês</Text>
                {incomeChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: incomeChange >= 0 ? colors.success : colors.danger }]}>{incomeChange >= 0 ? "↑" : "↓"} {Math.abs(incomeChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Sem dados anteriores</Text>
                )}
              </View>
              {/* Gastos */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.expenseBg }]}>
                  <Ionicons name="arrow-up" size={16} color={colors.danger} />
                </View>
                <Text style={styles.miniCardLabel}>Gastos</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.monthlyExpense)}</Text>
                <Text style={styles.miniCardSub}>Este mês</Text>
                {expenseChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: expenseChange > 0 ? colors.danger : colors.success }]}>{expenseChange > 0 ? "↑" : "↓"} {Math.abs(expenseChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Sem dados anteriores</Text>
                )}
              </View>
              {/* Economia */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.info + "1a" }]}>
                  <Ionicons name="trending-up" size={16} color={colors.info} />
                </View>
                <Text style={styles.miniCardLabel}>Economia</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(Math.max(0, economia))}</Text>
                <Text style={styles.miniCardSub}>Este mês</Text>
                <Text style={[styles.miniCardChange, { color: economia >= 0 ? colors.success : colors.danger }]}>{economia >= 0 ? "↑" : "↓"} {Math.abs(economiaPercent)}%</Text>
                <Text style={styles.miniCardNote}>da renda</Text>
              </View>
              {/* Saldo acumulado */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.primary + "1a" }]}>
                  <Ionicons name="wallet" size={16} color={colors.primary} />
                </View>
                <Text style={styles.miniCardLabel}>Caixa</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.balance)}</Text>
                <Text style={styles.miniCardSub}>Total</Text>
                {balanceChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: balanceChange >= 0 ? colors.success : colors.danger }]}>{balanceChange >= 0 ? "↑" : "↓"} {Math.abs(balanceChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Acumulado total</Text>
                )}
              </View>
              {/* Contas a receber */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.incomeBg }]}>
                  <Ionicons name="download-outline" size={16} color={colors.success} />
                </View>
                <Text style={styles.miniCardLabel}>A receber</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.pendingReceivables)}</Text>
                <Text style={styles.miniCardSub}>Pendente</Text>
                {receivablesChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: receivablesChange >= 0 ? colors.success : colors.danger }]}>{receivablesChange >= 0 ? "↑" : "↓"} {Math.abs(receivablesChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Sem dados anteriores</Text>
                )}
              </View>
              {/* Contas a pagar */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: colors.expenseBg }]}>
                  <Ionicons name="arrow-up" size={16} color={colors.danger} />
                </View>
                <Text style={styles.miniCardLabel}>A pagar</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.pendingPayables)}</Text>
                <Text style={styles.miniCardSub}>Pendente</Text>
                {payablesChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: payablesChange > 0 ? colors.danger : colors.success }]}>{payablesChange > 0 ? "↑" : "↓"} {Math.abs(payablesChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Sem dados anteriores</Text>
                )}
              </View>
            </HorizontalScrollFade>

            {/* ── Saúde Financeira ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.sectionTitle}>Saúde financeira</Text>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                </View>
                <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/health" as any)}>
                  <Text style={styles.linkButtonText}>Ver detalhes {">"}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
                <CircularProgress size={90} strokeWidth={8} progress={healthScore / 100} progressColor={healthScoreData?.color || colors.success}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.textPrimary }}>{healthScore}</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>de 100</Text>
                </CircularProgress>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: healthScoreData?.color || colors.textPrimary }}>
                    {healthScoreData?.label || "Calculando..."}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                    {healthScoreData?.summary || "Aguarde, estamos avaliando sua saúde financeira."}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", marginTop: 2 }}>
                    {healthScoreData?.suggestion}
                  </Text>
                </View>
              </View>
              <View style={styles.healthScoresRow}>
                {healthScoreData?.pillars.map((pillar) => (
                  <View key={pillar.key} style={styles.healthScoreItem}>
                    <Text style={styles.healthScoreLabel}>{pillar.label}</Text>
                    <Text style={[styles.healthScoreValue, { color: pillar.color }]}>{pillar.score}</Text>
                  </View>
                ))}
              </View>
              {healthScoreData && healthScoreData.risks.length > 0 && (
                <View style={styles.warningBanner}>
                  <Text style={styles.warningBannerTitle}>⚠️ Atenção</Text>
                  <Text style={styles.warningBannerText}>{healthScoreData.risks[0]}</Text>
                </View>
              )}
              {healthScoreData && healthScoreData.highlights.length > 0 && (
                <View style={{ backgroundColor: colors.success + "1a", borderRadius: radius.md, padding: spacing.sm, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>✓ Destaques</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={2}>
                    {healthScoreData.highlights.slice(0, 2).join(" • ")}
                  </Text>
                </View>
              )}
            </View>

            {/* ── Radar Financeiro ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Radar Financeiro</Text>
                <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/transactions" as any)}>
                  <Text style={styles.linkButtonText}>Ver tudo {">"}</Text>
                </TouchableOpacity>
              </View>
              <HorizontalScrollFade
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.lg }}
                fadeColor={colors.surface}
              >
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/transactions")}>
                  <View style={styles.radarCircle}>
                    <AlertIcon size={24} />
                    <View style={[styles.radarBadge, { backgroundColor: colors.danger }]}><Text style={styles.radarBadgeText}>{data.overdueCount}</Text></View>
                  </View>
                  <Text style={styles.radarLabel}>Contas{"\n"}vencidas</Text>
                  <Text style={{ fontSize: 9, color: colors.danger, fontWeight: "700" }}>{formatCurrency(data.overdueAmount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/recurring")}>
                  <View style={styles.radarCircle}>
                    <CreditCardIcon size={24} />
                    {data.activeRecurring > 0 && <View style={[styles.radarBadge, { backgroundColor: colors.primary }]}><Text style={styles.radarBadgeText}>{data.activeRecurring}</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Assinaturas{"\n"}ativas</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/recurring")}>
                  <View style={styles.radarCircle}>
                    <CalendarIcon size={24} />
                    <View style={[styles.radarBadge, { backgroundColor: colors.warning }]}><Text style={styles.radarBadgeText}>{bills.length}</Text></View>
                  </View>
                  <Text style={styles.radarLabel}>Contas próximas{"\n"}do vencimento</Text>
                  <Text style={{ fontSize: 9, color: colors.warning, fontWeight: "700" }}>{formatCurrency(bills.reduce((s: number, b: UpcomingBill) => s + b.amount, 0))}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/transactions")}>
                  <View style={styles.radarCircle}>
                    <HourglassDoneIcon size={24} />
                    {data.pendingCount > 0 && <View style={[styles.radarBadge, { backgroundColor: colors.success }]}><Text style={styles.radarBadgeText}>{data.pendingCount}</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Transações{"\n"}pendentes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => setChartModal("commitment")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="pie-chart" size={24} color={colors.info} />
                    <View style={[styles.radarBadge, { backgroundColor: comprometimento > 60 ? "#fb923c" : colors.success, width: "auto", minWidth: 18, paddingHorizontal: 3 }]}><Text style={styles.radarBadgeText}>{comprometimento}%</Text></View>
                  </View>
                  <Text style={styles.radarLabel}>Comprometimento{"\n"}da renda</Text>
                </TouchableOpacity>
              </HorizontalScrollFade>
            </View>

            {/* ── Two-column: Gastos por categoria + Gastos ao longo do mês ── */}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {data.expensesByCategory.length > 0 && (
                <View style={[styles.sectionCard, { flex: 1 }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitleSm}>Gastos por categoria</Text>
                    <TouchableOpacity style={styles.linkButtonSm} onPress={() => setChartModal("category")}><Text style={styles.linkButtonTextSm}>Ver todas {">"}</Text></TouchableOpacity>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <PieChart
                      data={data.expensesByCategory.map((cat: { name: string; value: number; color: string }, i: number) => ({ value: cat.value, color: cat.color || pieColors[i % pieColors.length] }))}
                      donut innerCircleColor={colors.surface} radius={50} innerRadius={32}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textPrimary }} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(data.monthlyExpense)}</Text>
                          <Text style={{ fontSize: 8, color: colors.textMuted }}>Total</Text>
                        </View>
                      )}
                    />
                  </View>
                  <View style={{ gap: 4 }}>
                    {data.expensesByCategory.slice(0, 5).map((cat: { name: string; value: number; color: string }, i: number) => {
                      const pct = Math.round((cat.value / totalExpense) * 100);
                      const catColor = cat.color || pieColors[i % pieColors.length];
                      return (
                        <View key={cat.name} style={styles.catLegendItem}>
                          <View style={[styles.catDot, { backgroundColor: catColor }]} />
                          <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
                          <Text style={styles.catPct}>{pct}%</Text>
                        </View>
                      );
                    })}
                  </View>
                  {data.expensesByCategory.length > 0 && (
                    <View style={styles.catFooter}>
                      <Text style={styles.catFooterText}>{data.expensesByCategory[0].name} foi sua maior categoria</Text>
                      <Text style={styles.catFooterSub}>{Math.round((data.expensesByCategory[0].value / totalExpense) * 100)}% do total de gastos</Text>
                    </View>
                  )}
                </View>
              )}
              <View style={[styles.sectionCard, { flex: 1 }]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitleSm}>Gastos ao longo do mês</Text>
                  <TouchableOpacity style={styles.linkButtonSm} onPress={() => setChartModal("bar")}><Text style={styles.linkButtonTextSm}>Ver mais {">"}</Text></TouchableOpacity>
                </View>
                <BarChart
                  data={dailyExpenseChartData}
                  width={HALF_WIDTH - spacing.lg * 2 - 20}
                  barWidth={12} spacing={6} roundedTop roundedBottom hideYAxisText
                  yAxisThickness={0} xAxisThickness={0}
                  xAxisLabelTextStyle={{ fontSize: 8, color: colors.textMuted }}
                  noOfSections={3} height={120}
                  rulesColor={colors.border} rulesType="dashed" backgroundColor="transparent"
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 9, color: colors.textMuted }}>Média semanal</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textPrimary }}>{formatCurrency(data.monthlyExpense / 4)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 9, color: colors.textMuted }}>vs mês anterior</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: expenseChange !== null && expenseChange > 0 ? colors.danger : colors.success }}>{expenseChange !== null ? `${expenseChange > 0 ? "↑" : "↓"} ${Math.abs(expenseChange)}%` : "—"}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── Previsão de saldo (IA) ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.sectionTitle}>Previsão de saldo</Text>
                  <View style={{ backgroundColor: colors.primary + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: colors.primary }}>IA</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.linkButton} onPress={() => setChartModal("line")}><Text style={styles.linkButtonText}>Ver gráfico {">"}</Text></TouchableOpacity>
              </View>

              {forecastLoading && !aiForecast ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Analisando seus dados...</Text>
                </View>
              ) : aiForecast ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={{ fontSize: 22, fontWeight: "800", color: aiForecast.trend === "negativa" ? colors.danger : colors.success }}>
                      {formatCurrency(aiForecast.forecastBalance)}
                    </Text>
                    <View style={{ backgroundColor: aiForecast.riskLevel === "alto" ? colors.danger + "22" : aiForecast.riskLevel === "medio" ? colors.warning + "22" : colors.success + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: aiForecast.riskLevel === "alto" ? colors.danger : aiForecast.riskLevel === "medio" ? colors.warning : colors.success }}>
                        {aiForecast.riskLevel === "alto" ? "Risco alto" : aiForecast.riskLevel === "medio" ? "Risco médio" : "Baixo risco"}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>{aiForecast.summary}</Text>
                  <View style={{ backgroundColor: colors.primary + "11", borderRadius: radius.md, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>💡 {aiForecast.insight}</Text>
                  </View>
                  {aiForecast.savingsPotential > 0 && (
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Potencial de economia: {formatCurrency(aiForecast.savingsPotential)}</Text>
                  )}
                  <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: "right" }}>
                    {aiForecast.cached ? "🔄 Atualizado hoje" : "✨ Gerado agora"}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>Estimativa simples</Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.success }}>{formatCurrency(Math.max(0, data.balance - data.upcomingAmount))}</Text>
                </View>
              )}

              <View style={{ height: 100, overflow: "hidden", marginTop: spacing.sm }}>
                <LineChart
                  data={netTrendChartData}
                  width={SCREEN_WIDTH - CARD_PADDING * 2 - spacing.lg * 2 - 30} height={90}
                  color={colors.success} thickness={2}
                  hideDataPoints={netTrendChartData.length <= 1} dataPointsColor={colors.success} dataPointsRadius={3}
                  curved areaChart
                  startFillColor={colors.success} endFillColor="transparent" startOpacity={0.3} endOpacity={0}
                  yAxisTextStyle={{ fontSize: 9, color: colors.textMuted }}
                  xAxisLabelTextStyle={{ fontSize: 9, color: colors.textMuted }}
                  yAxisColor="transparent" xAxisColor={colors.border}
                  noOfSections={3} rulesColor={colors.border} rulesType="dashed"
                />
              </View>
              {data.balance < data.upcomingAmount && (
                <View style={styles.warningBanner}>
                  <Text style={styles.warningBannerTitle}>⚠️ Tendência de queda</Text>
                  <Text style={styles.warningBannerText}>Seu saldo pode ficar negativo. Contas pendentes: {formatCurrency(data.upcomingAmount)}</Text>
                </View>
              )}
            </View>

            {/* ── Comprometimento da renda ── */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Comprometimento da renda</Text>
              <View style={{ flexDirection: "row", gap: spacing.lg, alignItems: "center" }}>
                <CircularProgress size={100} strokeWidth={10} progress={comprometimento / 100} progressColor={comprometimento > 60 ? "#fb923c" : comprometimento > 40 ? colors.warning : colors.success}>
                  <Text style={{ fontSize: 24, fontWeight: "800", color: colors.textPrimary }}>{comprometimento}%</Text>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: comprometimento > 60 ? "#fb923c" : comprometimento > 40 ? colors.warning : colors.success }}>
                    {comprometimento > 60 ? "Alto" : comprometimento > 40 ? "Médio" : "Baixo"}
                  </Text>
                </CircularProgress>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Gastos do mês</Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.textPrimary }}>{formatCurrency(data.monthlyExpense)}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>de {formatCurrency(data.monthlyIncome)}</Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(comprometimento, 100)}%`, backgroundColor: comprometimento > 60 ? "#fb923c" : comprometimento > 40 ? colors.warning : colors.success }]} />
                  </View>
                </View>
              </View>
              {comprometimento > 60 && (
                <View style={styles.warningRow}>
                  <Ionicons name="warning" size={16} color="#fb923c" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>Alto comprometimento da renda</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Ideal abaixo de 60%</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── Bottom Grid ── */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
              {/* Contas futuras previstas */}
              <View style={[styles.sectionCard, { width: HALF_WIDTH }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.sectionTitleSm}>Contas futuras{"\n"}previstas</Text>
                  <TouchableOpacity style={styles.linkButtonSm} onPress={() => router.push("/recurring")}><Text style={styles.linkButtonTextSm}>Ver todos {">"}</Text></TouchableOpacity>
                </View>
                <View style={{ gap: 8 }}>
                  {futureBills.length > 0 ? futureBills.map((bill: UpcomingBill) => (
                    <View key={bill.id} style={styles.billItem}>
                      <View style={[styles.billDot, { backgroundColor: bill.color }]} />
                      <Text style={styles.billName} numberOfLines={1}>{bill.name}</Text>
                      <Text style={styles.billDate}>{bill.date}</Text>
                      <Text style={styles.billValue}>{formatCurrency(bill.amount)}</Text>
                    </View>
                  )) : (
                    <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "center" }}>Nenhuma conta futura</Text>
                  )}
                </View>
              </View>

              {/* Metas */}
              <TouchableOpacity style={[styles.sectionCard, { width: HALF_WIDTH }]} onPress={() => router.push("/plan")} activeOpacity={0.8}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.sectionTitleSm}>Metas</Text>
                  <Text style={styles.linkButtonTextSm}>Ver todas {">"}</Text>
                </View>
                {goals.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={(goals[0].icon as keyof typeof Ionicons.glyphMap) || "trending-up"} size={16} color={goals[0].color || colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary }} numberOfLines={1}>{goals[0].name}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{formatCurrency(goals[0].savedValue)} de {formatCurrency(goals[0].targetValue)}</Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${goals[0].progress}%`, backgroundColor: goals[0].color || colors.primary }]} />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View><Text style={{ fontSize: 9, color: colors.textMuted }}>Falta</Text><Text style={{ fontSize: 12, fontWeight: "700", color: colors.textPrimary }}>{formatCurrency(goals[0].remaining)}</Text></View>
                      {goals[0].estimatedMonths !== null && (
                        <View style={{ alignItems: "flex-end" }}><Text style={{ fontSize: 9, color: colors.textMuted }}>Tempo estimado</Text><Text style={{ fontSize: 12, fontWeight: "700", color: colors.textPrimary }}>{goals[0].estimatedMonths} {goals[0].estimatedMonths === 1 ? "mês" : "meses"}</Text></View>
                      )}
                    </View>
                    {goals.length > 1 && <Text style={{ fontSize: 9, color: colors.textMuted }}>+{goals.length - 1} {goals.length - 1 === 1 ? "meta" : "metas"}</Text>}
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "center" }}>Nenhuma meta cadastrada</Text>
                )}
              </TouchableOpacity>

              {/* Streak financeiro */}
              <View style={[styles.sectionCard, { width: HALF_WIDTH }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>🔥</Text>
                  <Text style={styles.sectionTitleSm}>Streak financeiro</Text>
                </View>
                <Text style={{ fontSize: 28, fontWeight: "800", color: colors.textPrimary }}>{streak?.streak ?? 0} <Text style={{ fontSize: 14, fontWeight: "600" }}>dias</Text></Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>Registrando suas finanças</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  {(streak?.weekDays ?? [{ label: "S", active: false }, { label: "T", active: false }, { label: "Q", active: false }, { label: "Q", active: false }, { label: "S", active: false }, { label: "S", active: false }, { label: "D", active: false }]).map((d: { label: string; active: boolean }, i: number) => (
                    <View key={`${d.label}-${i}`} style={[styles.streakDay, d.active && styles.streakDayActive]}>
                      <Text style={[styles.streakDayText, d.active && styles.streakDayTextActive]}>{d.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Score financeiro */}
              <View style={[styles.sectionCard, { width: HALF_WIDTH, alignItems: "center" }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
                  <Text style={styles.sectionTitleSm}>Score financeiro</Text>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                </View>
                <CircularProgress size={80} strokeWidth={8} progress={(score?.score ?? 0) / (score?.maxScore ?? 1000)} progressColor={score && score.score >= 600 ? colors.success : score && score.score >= 300 ? colors.warning : colors.danger}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.textPrimary }}>{score?.score ?? 0}</Text>
                  <Text style={{ fontSize: 8, color: colors.textMuted }}>de {score?.maxScore ?? 1000}</Text>
                </CircularProgress>
                <Text style={{ fontSize: 12, color: score ? (score.score >= 600 ? colors.success : score.score >= 300 ? colors.warning : colors.danger) : colors.textMuted }}>★ {score?.label ?? (score === null ? "Sem conexão" : "Calculando...")}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Chart Modal ── */}
        <Modal visible={chartModal !== null} transparent animationType="slide" onRequestClose={() => setChartModal(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
                <Text style={styles.sectionTitle}>
                  {chartModal === "category" ? "Gastos por categoria" : chartModal === "bar" ? "Gastos mensais" : chartModal === "line" ? "Previsão de saldo" : "Comprometimento"}
                </Text>
                <TouchableOpacity onPress={() => setChartModal(null)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
              </View>

              {chartModal === "category" && data && data.expensesByCategory.length > 0 && (
                <View style={{ alignItems: "center", gap: spacing.md }}>
                  <PieChart
                    data={data.expensesByCategory.map((cat: { name: string; value: number; color: string }, i: number) => ({ value: cat.value, color: cat.color || pieColors[i % pieColors.length] }))}
                    donut innerCircleColor={colors.surface} radius={100} innerRadius={65}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary }}>{formatCurrency(data.monthlyExpense)}</Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>Total</Text>
                      </View>
                    )}
                  />
                  <View style={{ gap: 8, width: "100%" }}>
                    {data.expensesByCategory.map((cat: { name: string; value: number; color: string }, i: number) => (
                      <View key={cat.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.catDot, { backgroundColor: cat.color || pieColors[i % pieColors.length] }]} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary }}>{cat.name}</Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary }}>{formatCurrency(cat.value)}</Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{Math.round((cat.value / totalExpense) * 100)}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {chartModal === "bar" && data && (
                <BarChart
                  data={dailyExpenseChartData}
                  width={SCREEN_WIDTH - spacing.lg * 4 - 40} height={250}
                  barWidth={20} spacing={14} roundedTop roundedBottom
                  yAxisThickness={0} xAxisThickness={0} hideYAxisText
                  xAxisLabelTextStyle={{ fontSize: 10, color: colors.textMuted }}
                  noOfSections={5} rulesColor={colors.border} rulesType="dashed" backgroundColor="transparent"
                />
              )}

              {chartModal === "line" && data && (
                <LineChart
                  data={netTrendChartData}
                  width={SCREEN_WIDTH - spacing.lg * 4 - 40} height={250}
                  color={colors.success} thickness={2}
                  hideDataPoints={false} dataPointsColor={colors.success} dataPointsRadius={4}
                  curved areaChart
                  startFillColor={colors.success} endFillColor="transparent" startOpacity={0.3} endOpacity={0}
                  yAxisTextStyle={{ fontSize: 10, color: colors.textMuted }}
                  xAxisLabelTextStyle={{ fontSize: 10, color: colors.textMuted }}
                  yAxisColor="transparent" xAxisColor={colors.border}
                  noOfSections={5} rulesColor={colors.border} rulesType="dashed"
                />
              )}

              {chartModal === "commitment" && data && (
                <View style={{ alignItems: "center", gap: spacing.lg }}>
                  <CircularProgress size={150} strokeWidth={14} progress={comprometimento / 100} progressColor={comprometimento > 60 ? "#fb923c" : comprometimento > 40 ? colors.warning : colors.success}>
                    <Text style={{ fontSize: 36, fontWeight: "800", color: colors.textPrimary }}>{comprometimento}%</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>comprometido</Text>
                  </CircularProgress>
                  <View style={{ gap: 8, width: "100%" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Gastos do mês</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.danger }}>{formatCurrency(data.monthlyExpense)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Renda do mês</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success }}>{formatCurrency(data.monthlyIncome)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Economia</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: economia >= 0 ? colors.success : colors.danger }}>{formatCurrency(economia)}</Text>
                    </View>
                    <View style={[styles.progressBarBg, { height: 10, marginTop: 4 }]}>
                      <View style={[styles.progressBarFill, { height: 10, width: `${Math.min(comprometimento, 100)}%`, backgroundColor: comprometimento > 60 ? "#fb923c" : colors.success }]} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center" }}>
                      {comprometimento > 80 ? "Atenção! Você está comprometendo mais de 80% da renda." : comprometimento > 60 ? "Alto comprometimento. Ideal abaixo de 60%." : "Bom controle financeiro!"}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
      <ScrollFade />
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  /* Header */
  dashHeader: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  dashTitle: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.xs },

  /* Month selector */
  monthSelector: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.sm },
  monthSelectorText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, minWidth: 140, textAlign: "center" },
  todayBtn: { backgroundColor: colors.primary + "22", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full, marginLeft: spacing.sm },
  todayBtnText: { fontSize: 12, fontWeight: "600", color: colors.primary },

  /* Error */
  error: { fontSize: 13, color: colors.danger, backgroundColor: colors.expenseBg, padding: spacing.md, borderRadius: radius.md },

  /* Token Limit Banner */
  tokenLimitBanner: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#fef3c7", 
    padding: spacing.md, 
    borderRadius: radius.md, 
    gap: spacing.sm 
  },
  tokenLimitText: { 
    flex: 1, 
    fontSize: 13, 
    color: "#92400e", 
    fontWeight: "500" 
  },
  tokenLimitButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  tokenLimitButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },

  /* Balance Card */
  balanceCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  balanceHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  balanceValue: { fontSize: 28, fontWeight: "800", color: colors.success },
  balanceDualRow: { flexDirection: "row", alignItems: "stretch", gap: spacing.md, marginTop: 4 },
  balanceDualItem: { flex: 1 },
  balanceDualLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  balanceDualValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  balanceDualDivider: { width: 1, backgroundColor: colors.border },
  balanceSubRow: { flexDirection: "row", gap: spacing.xl, marginTop: 4 },
  balanceSubLabel: { fontSize: 11, color: colors.textMuted },
  balanceSubValue: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },

  /* Mini Cards */
  miniCard: { width: 130, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  miniCardIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  miniCardLabel: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, marginTop: 4 },
  miniCardValue: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  miniCardSub: { fontSize: 10, color: colors.textMuted },
  miniCardChange: { fontSize: 12, fontWeight: "700" },
  miniCardNote: { fontSize: 9, color: colors.textMuted },

  /* Section Card */
  sectionCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  sectionTitleSm: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  linkText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  linkTextSm: { fontSize: 10, color: colors.primary, fontWeight: "600" },
  linkButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  linkButtonText: { fontSize: 12, color: "#000000", fontWeight: "700" },
  linkButtonSm: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  linkButtonTextSm: { fontSize: 10, color: "#000000", fontWeight: "700" },

  /* Health Scores */
  healthScoresRow: { flexDirection: "row", justifyContent: "space-between" },
  healthScoreItem: { alignItems: "center", gap: 4 },
  healthScoreLabel: { fontSize: 10, color: colors.textMuted },
  healthScoreValue: { fontSize: 16, fontWeight: "700" },

  /* Radar */
  radarItem: { alignItems: "center", gap: 8, width: 70 },
  radarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  radarBadge: { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  radarBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  radarLabel: { fontSize: 9, color: colors.textMuted, textAlign: "center" },

  /* Category Legend */
  catLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 10, color: colors.textSecondary },
  catPct: { fontSize: 10, fontWeight: "600", color: colors.textPrimary },
  catFooter: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.sm },
  catFooterText: { fontSize: 10, fontWeight: "600", color: colors.textPrimary },
  catFooterSub: { fontSize: 9, color: colors.textMuted },

  /* Progress Bar */
  progressBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: 6, borderRadius: 3 },

  /* Warning */
  warningBanner: { backgroundColor: colors.warning + "1a", borderRadius: radius.md, padding: spacing.sm },
  warningBannerTitle: { fontSize: 12, fontWeight: "700", color: colors.warning },
  warningBannerText: { fontSize: 11, color: colors.textSecondary },
  warningRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },

  /* Bills */
  billItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  billDot: { width: 5, height: 5, borderRadius: 2.5 },
  billName: { flex: 1, fontSize: 10, color: colors.textPrimary },
  billDate: { fontSize: 9, color: colors.textMuted },
  billValue: { fontSize: 10, fontWeight: "700", color: colors.textPrimary },

  /* Streak */
  streakDay: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  streakDayActive: { backgroundColor: colors.success },
  streakDayText: { fontSize: 8, fontWeight: "600", color: colors.textMuted },
  streakDayTextActive: { color: "#fff" },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, maxHeight: "85%" },
});
}
