import { getStoredUserName } from "@/lib/auth";
import type { GoalData, ScoreData, StreakData } from "@/lib/backend";
import { checkinStreak, getDashboardScore, getGoals, getMe, getStreak } from "@/lib/backend";
import type { UpcomingBill } from "@/lib/repositories/dashboard";
import { getDashboard, getUpcomingBills } from "@/lib/repositories/dashboard";
import { colors, radius, spacing } from "@/lib/theme";
import type { DashboardData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle as SvgCircle } from "react-native-svg";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_PADDING = spacing.lg;
const HALF_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - spacing.md) / 2;

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
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={bgColor || "rgba(255,255,255,0.08)"} strokeWidth={strokeWidth} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={progressColor} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartModal, setChartModal] = useState<"category" | "bar" | "line" | "commitment" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Load cached name immediately
      const cachedName = await getStoredUserName();
      if (cachedName) setUserName(cachedName);

      const [dashRes, billsRes] = await Promise.all([
        getDashboard(),
        getUpcomingBills(),
      ]);
      setData(dashRes);
      setBills(billsRes);

      // Backend calls (non-blocking — fail silently if offline)
      Promise.all([
        getMe().then((u) => { if (u.name) setUserName(u.name); }).catch(() => {}),
        getGoals().then(setGoals).catch(() => {}),
        getStreak().then(setStreak).catch(() => {}),
        getDashboardScore().then(setScore).catch(() => {}),
        checkinStreak().catch(() => {}),
      ]);

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
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const pieColors = ["#a78bfa", "#f472b6", "#60a5fa", "#fbbf24", "#34d399", "#fb923c"];

  const economia = data ? data.monthlyIncome - data.monthlyExpense : 0;
  const economiaPercent = data && data.monthlyIncome > 0 ? Math.round((economia / data.monthlyIncome) * 100) : 0;
  const comprometimento = data && data.monthlyIncome > 0 ? Math.round((data.monthlyExpense / data.monthlyIncome) * 100) : 0;
  const savingsRate = data && data.monthlyIncome > 0 ? economia / data.monthlyIncome : 0;
  const healthScore = data
    ? Math.min(100, Math.max(0, Math.round(savingsRate * 200 + 50 - (data.overdueAmount > 0 ? 20 : 0) - data.pendingCount * 2)))
    : 0;
  // Encontrar o mês imediatamente anterior (não qualquer mês anterior no trend)
  const currentMonth = data ? new Date().toISOString().slice(0, 7) : null;
  const prevMonthStr = data ? (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })() : null;
  const prevMonth = data ? data.monthlyTrend.find((m) => m.month === prevMonthStr) ?? null : null;
  const incomeChange = prevMonth && prevMonth.income > 0 ? Math.round(((data!.monthlyIncome - prevMonth.income) / prevMonth.income) * 100) : null;
  const expenseChange = prevMonth && prevMonth.expense > 0 ? Math.round(((data!.monthlyExpense - prevMonth.expense) / prevMonth.expense) * 100) : null;
  const currentMonthTrend = data ? data.monthlyTrend.find((m) => m.month === currentMonth) : null;
  const balanceChange = currentMonthTrend && prevMonth
    ? (() => { const recentNet = currentMonthTrend.income - currentMonthTrend.expense; const prevNet = prevMonth.income - prevMonth.expense; return prevNet !== 0 ? Math.round(((recentNet - prevNet) / Math.abs(prevNet)) * 100) : null; })()
    : null;
  const totalExpense = data ? data.monthlyExpense || 1 : 1;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="menu" size={24} color={colors.textPrimary} /></TouchableOpacity>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.greeting}>Olá, {userName || "Usuário"} 👋</Text>
            <Text style={styles.subtitle}>Aqui está o resumo da sua vida financeira.</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="search" size={22} color={colors.textPrimary} /></TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }} style={{ overflow: "visible" }}>
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              {data && data.pendingCount > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(data.pendingCount, 9)}</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {data && (
          <>
            {/* ── Saldo disponível ── */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeaderRow}>
                <Text style={styles.balanceLabel}>Saldo disponível</Text>
                <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.balanceValue}>{formatCurrency(data.balance)}</Text>
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
            </View>

            {/* ── 4 Summary Mini-Cards (horizontal scroll) ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -CARD_PADDING }} contentContainerStyle={{ paddingHorizontal: CARD_PADDING, gap: spacing.md }}>
              {/* Receitas */}
              <View style={styles.miniCard}>
                <View style={[styles.miniCardIcon, { backgroundColor: "#064e3b" }]}>
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
                <View style={[styles.miniCardIcon, { backgroundColor: "#7f1d1d" }]}>
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
                <View style={[styles.miniCardIcon, { backgroundColor: "#1e3a5f" }]}>
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
                <View style={[styles.miniCardIcon, { backgroundColor: "#2d1b69" }]}>
                  <Ionicons name="wallet" size={16} color={colors.primary} />
                </View>
                <Text style={styles.miniCardLabel}>Saldo acumulado</Text>
                <Text style={styles.miniCardValue}>{formatCurrency(data.balance)}</Text>
                <Text style={styles.miniCardSub}>Total</Text>
                {balanceChange !== null ? (
                  <><Text style={[styles.miniCardChange, { color: balanceChange >= 0 ? colors.success : colors.danger }]}>{balanceChange >= 0 ? "↑" : "↓"} {Math.abs(balanceChange)}%</Text>
                  <Text style={styles.miniCardNote}>vs mês anterior</Text></>
                ) : (
                  <Text style={styles.miniCardNote}>Acumulado total</Text>
                )}
              </View>
            </ScrollView>

            {/* ── Saúde Financeira ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.sectionTitle}>Saúde financeira</Text>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                </View>
                <Text style={styles.linkText}>Ver detalhes {">"}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
                <CircularProgress size={90} strokeWidth={8} progress={healthScore / 100} progressColor={healthScore >= 70 ? colors.success : healthScore >= 40 ? colors.warning : colors.danger}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: colors.textPrimary }}>{healthScore}</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>de 100</Text>
                </CircularProgress>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                    {healthScore >= 70 ? "Muito bom! Continue assim para alcançar todos os seus objetivos." : healthScore >= 40 ? "Razoável. Tente reduzir gastos para melhorar." : "Atenção! Seus gastos estão muito altos."}
                  </Text>
                </View>
              </View>
              <View style={styles.healthScoresRow}>
                <View style={styles.healthScoreItem}>
                  <Text style={styles.healthScoreLabel}>Organização</Text>
                  <Text style={[styles.healthScoreValue, { color: colors.info }]}>{Math.min(100, Math.round((streak?.streak ?? 0) * 3.3 + (streak?.todayRegistered ? 20 : 0)))}</Text>
                </View>
                <View style={styles.healthScoreItem}>
                  <Text style={styles.healthScoreLabel}>Estabilidade</Text>
                  <Text style={[styles.healthScoreValue, { color: colors.primary }]}>{Math.min(100, Math.max(0, 100 - comprometimento))}</Text>
                </View>
                <View style={styles.healthScoreItem}>
                  <Text style={styles.healthScoreLabel}>Controle</Text>
                  <Text style={[styles.healthScoreValue, { color: colors.success }]}>{Math.min(100, Math.max(0, data.overdueAmount > 0 ? 40 : data.pendingCount > 3 ? 60 : 90))}</Text>
                </View>
                <View style={styles.healthScoreItem}>
                  <Text style={styles.healthScoreLabel}>Planejamento</Text>
                  <Text style={[styles.healthScoreValue, { color: colors.warning }]}>{Math.min(100, goals.length * 25 + bills.length * 10)}</Text>
                </View>
              </View>
            </View>

            {/* ── Radar Financeiro ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Radar Financeiro</Text>
                <Text style={styles.linkText}>Ver tudo {">"}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.lg }}>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/transactions")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="alert-circle" size={24} color="#f87171" />
                    {data.overdueAmount > 0 && <View style={[styles.radarBadge, { backgroundColor: "#f87171" }]}><Text style={styles.radarBadgeText}>!</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Contas{"\n"}vencidas</Text>
                  {data.overdueAmount > 0 && <Text style={{ fontSize: 9, color: "#f87171", fontWeight: "700" }}>{formatCurrency(data.overdueAmount)}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/recurring")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="card" size={24} color="#a78bfa" />
                    {data.activeRecurring > 0 && <View style={[styles.radarBadge, { backgroundColor: "#a78bfa" }]}><Text style={styles.radarBadgeText}>{data.activeRecurring}</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Assinaturas{"\n"}ativas</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/recurring")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="calendar" size={24} color="#fbbf24" />
                    {bills.length > 0 && <View style={[styles.radarBadge, { backgroundColor: "#fbbf24" }]}><Text style={styles.radarBadgeText}>{bills.length}</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Contas próximas{"\n"}do vencimento</Text>
                  {bills.length > 0 && <Text style={{ fontSize: 9, color: "#fbbf24", fontWeight: "700" }}>{formatCurrency(bills.reduce((s, b) => s + b.amount, 0))}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => router.push("/transactions")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="time" size={24} color="#34d399" />
                    {data.pendingCount > 0 && <View style={[styles.radarBadge, { backgroundColor: "#34d399" }]}><Text style={styles.radarBadgeText}>{data.pendingCount}</Text></View>}
                  </View>
                  <Text style={styles.radarLabel}>Transações{"\n"}pendentes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radarItem} onPress={() => setChartModal("commitment")}>
                  <View style={styles.radarCircle}>
                    <Ionicons name="pie-chart" size={24} color="#60a5fa" />
                    <View style={[styles.radarBadge, { backgroundColor: comprometimento > 60 ? "#fb923c" : colors.success }]}><Text style={styles.radarBadgeText}>{comprometimento}%</Text></View>
                  </View>
                  <Text style={styles.radarLabel}>Comprometimento{"\n"}da renda</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── Two-column: Gastos por categoria + Gastos ao longo do mês ── */}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {data.expensesByCategory.length > 0 && (
                <View style={[styles.sectionCard, { flex: 1 }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitleSm}>Gastos por categoria</Text>
                    <TouchableOpacity onPress={() => setChartModal("category")}><Text style={styles.linkTextSm}>Ver todas {">"}</Text></TouchableOpacity>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <PieChart
                      data={data.expensesByCategory.map((cat, i) => ({ value: cat.value, color: cat.color || pieColors[i % pieColors.length] }))}
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
                    {data.expensesByCategory.slice(0, 5).map((cat, i) => {
                      const pct = Math.round((cat.value / totalExpense) * 100);
                      return (
                        <View key={cat.name} style={styles.catLegendItem}>
                          <View style={[styles.catDot, { backgroundColor: cat.color || pieColors[i % pieColors.length] }]} />
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
                  <TouchableOpacity onPress={() => setChartModal("bar")}><Text style={styles.linkTextSm}>Ver mais {">"}</Text></TouchableOpacity>
                </View>
                <BarChart
                  data={data.monthlyTrend.length > 0
                    ? data.monthlyTrend.slice(-5).map((m) => ({ label: m.month.slice(5), value: m.expense, frontColor: colors.chartBar1 }))
                    : [{ label: "-", value: 0, frontColor: colors.chartBar1 }]}
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

            {/* ── Previsão de saldo ── */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Previsão de saldo</Text>
                <TouchableOpacity onPress={() => setChartModal("line")}><Text style={styles.linkText}>Ver detalhes {">"}</Text></TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Se continuar assim, você termina o mês com</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.success }}>{formatCurrency(Math.max(0, data.balance - data.upcomingAmount))}</Text>
              <LineChart
                data={data.monthlyTrend.length > 0
                  ? data.monthlyTrend.map((m) => ({ label: m.month.slice(5), value: m.income - m.expense }))
                  : [{ value: 0, label: "-" }]}
                width={SCREEN_WIDTH - CARD_PADDING * 2 - spacing.lg * 2 - 30} height={140}
                color={colors.success} thickness={2}
                hideDataPoints={false} dataPointsColor={colors.success} dataPointsRadius={3}
                curved areaChart
                startFillColor={colors.success} endFillColor="transparent" startOpacity={0.3} endOpacity={0}
                yAxisTextStyle={{ fontSize: 9, color: colors.textMuted }}
                xAxisLabelTextStyle={{ fontSize: 9, color: colors.textMuted }}
                yAxisColor="transparent" xAxisColor={colors.border}
                noOfSections={3} rulesColor={colors.border} rulesType="dashed"
              />
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
                  <TouchableOpacity onPress={() => router.push("/recurring")}><Text style={styles.linkTextSm}>Ver todos {">"}</Text></TouchableOpacity>
                </View>
                <View style={{ gap: 8 }}>
                  {bills.length > 0 ? bills.map((bill) => (
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
              <View style={[styles.sectionCard, { width: HALF_WIDTH }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.sectionTitleSm}>Metas</Text>
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
              </View>

              {/* Streak financeiro */}
              <View style={[styles.sectionCard, { width: HALF_WIDTH }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>🔥</Text>
                  <Text style={styles.sectionTitleSm}>Streak financeiro</Text>
                </View>
                <Text style={{ fontSize: 28, fontWeight: "800", color: colors.textPrimary }}>{streak?.streak ?? 0} <Text style={{ fontSize: 14, fontWeight: "600" }}>dias</Text></Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>Registrando suas finanças</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  {(streak?.weekDays ?? [{ label: "S", active: false }, { label: "T", active: false }, { label: "Q", active: false }, { label: "Q", active: false }, { label: "S", active: false }, { label: "S", active: false }, { label: "D", active: false }]).map((d, i) => (
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
                <Text style={{ fontSize: 12, color: score && score.score >= 600 ? colors.success : colors.warning }}>★ {score?.label ?? "Calculando..."}</Text>
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
                    data={data.expensesByCategory.map((cat, i) => ({ value: cat.value, color: cat.color || pieColors[i % pieColors.length] }))}
                    donut innerCircleColor={colors.surface} radius={100} innerRadius={65}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary }}>{formatCurrency(data.monthlyExpense)}</Text>
                        <Text style={{ fontSize: 10, color: colors.textMuted }}>Total</Text>
                      </View>
                    )}
                  />
                  <View style={{ gap: 8, width: "100%" }}>
                    {data.expensesByCategory.map((cat, i) => (
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
                  data={data.monthlyTrend.length > 0
                    ? data.monthlyTrend.map((m) => ({ label: m.month.slice(5), value: m.expense, frontColor: colors.chartBar1 }))
                    : [{ label: "-", value: 0, frontColor: colors.chartBar1 }]}
                  width={SCREEN_WIDTH - spacing.lg * 4 - 40} height={250}
                  barWidth={20} spacing={14} roundedTop roundedBottom
                  yAxisThickness={0} xAxisThickness={0} hideYAxisText
                  xAxisLabelTextStyle={{ fontSize: 10, color: colors.textMuted }}
                  noOfSections={5} rulesColor={colors.border} rulesType="dashed" backgroundColor="transparent"
                />
              )}

              {chartModal === "line" && data && (
                <LineChart
                  data={data.monthlyTrend.length > 0
                    ? data.monthlyTrend.map((m) => ({ label: m.month.slice(5), value: m.income - m.expense }))
                    : [{ value: 0, label: "-" }]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  /* Header */
  header: { flexDirection: "row", alignItems: "center" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  greeting: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: { position: "absolute", top: -6, right: -8, backgroundColor: colors.danger, borderRadius: 10, width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  /* Error */
  error: { fontSize: 13, color: colors.danger, backgroundColor: colors.expenseBg, padding: spacing.md, borderRadius: radius.md },

  /* Balance Card */
  balanceCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  balanceHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  balanceValue: { fontSize: 28, fontWeight: "800", color: colors.success },
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
  warningBanner: { backgroundColor: "rgba(251, 191, 36, 0.1)", borderRadius: radius.md, padding: spacing.sm },
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
