import type { GoalData, StreakData } from "@/lib/backend";
import { getGoals, getStreak } from "@/lib/backend";
import { calculateHealthScore } from "@/lib/health-score";
import type { UpcomingBill } from "@/lib/repositories/dashboard";
import { getDashboard, getUpcomingBills } from "@/lib/repositories/dashboard";
import { loadMonthStartDay } from "@/lib/settings";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DashboardData, HealthScoreResult } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle as SvgCircle } from "react-native-svg";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_PADDING = spacing.lg;

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

export default function HealthScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const startDay = await loadMonthStartDay();
      const now = new Date();
      const [dashRes, billsRes, streakRes, goalsRes] = await Promise.all([
        getDashboard({ year: now.getFullYear(), month: now.getMonth(), monthStartDay: startDay }),
        getUpcomingBills({ year: now.getFullYear(), month: now.getMonth(), monthStartDay: startDay }),
        getStreak().catch(() => null),
        getGoals().catch(() => []),
      ]);
      setData(dashRes);
      setBills(billsRes);
      setStreak(streakRes);
      setGoals(goalsRes);
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

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
        currentMonthStr
      )
    : null;

  if (loading || !healthScoreData) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saúde Financeira</Text>
          <View style={{ width: 32 }} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Score geral */}
        <View style={[styles.sectionCard, { alignItems: "center" }]}>
          <CircularProgress size={150} strokeWidth={12} progress={healthScoreData.overall / 100} progressColor={healthScoreData.color}>
            <Text style={{ fontSize: 48, fontWeight: "800", color: colors.textPrimary }}>{healthScoreData.overall}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>de 100</Text>
          </CircularProgress>
          <Text style={[styles.scoreLabel, { color: healthScoreData.color }]}>{healthScoreData.label}</Text>
          <Text style={styles.summary}>{healthScoreData.summary}</Text>
          <Text style={styles.suggestion}>{healthScoreData.suggestion}</Text>
        </View>

        {/* Tendência */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tendência</Text>
            <Ionicons
              name={healthScoreData.trend.direction === "up" ? "trending-up" : healthScoreData.trend.direction === "down" ? "trending-down" : "remove"}
              size={20}
              color={healthScoreData.trend.direction === "up" ? colors.success : healthScoreData.trend.direction === "down" ? colors.danger : colors.textMuted}
            />
          </View>
          <Text style={styles.sectionText}>{healthScoreData.trend.description}</Text>
        </View>

        {/* Riscos e destaques */}
        {healthScoreData.risks.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.danger + "1a" }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.danger }]}>Riscos</Text>
              <Ionicons name="warning" size={20} color={colors.danger} />
            </View>
            <View style={{ gap: spacing.sm }}>
              {healthScoreData.risks.map((risk, index) => (
                <View key={index} style={styles.riskItem}>
                  <View style={[styles.bullet, { backgroundColor: colors.danger }]} />
                  <Text style={styles.riskText}>{risk}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {healthScoreData.highlights.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.success + "1a" }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.success }]}>Destaques</Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
            <View style={{ gap: spacing.sm }}>
              {healthScoreData.highlights.map((highlight, index) => (
                <View key={index} style={styles.riskItem}>
                  <View style={[styles.bullet, { backgroundColor: colors.success }]} />
                  <Text style={styles.riskText}>{highlight}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Pilares */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Pilares</Text>
          <View style={{ gap: spacing.md }}>
            {healthScoreData.pillars.map((pillar) => (
              <View key={pillar.key} style={styles.pillarCard}>
                <View style={styles.pillarHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={styles.pillarLabel}>{pillar.label}</Text>
                    <Text style={[styles.pillarStatus, { color: pillar.color }]}>{pillar.status}</Text>
                  </View>
                  <Text style={[styles.pillarScore, { color: pillar.color }]}>{pillar.score}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${pillar.score}%`, backgroundColor: pillar.color }]} />
                </View>
                <Text style={styles.pillarDescription}>{pillar.description}</Text>
                <Text style={styles.pillarSuggestion}>{pillar.suggestion}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Resumo numérico */}
        {data && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Resumo do mês</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Receita</Text>
                <Text style={[styles.summaryValue, { color: colors.success }]}>{formatCurrency(data.monthlyIncome)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Despesa</Text>
                <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatCurrency(data.monthlyExpense)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Economia</Text>
                <Text style={[styles.summaryValue, { color: data.monthlyIncome - data.monthlyExpense >= 0 ? colors.success : colors.danger }]}>
                  {formatCurrency(data.monthlyIncome - data.monthlyExpense)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Caixa</Text>
                <Text style={styles.summaryValue}>{formatCurrency(data.balance)}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    content: { padding: CARD_PADDING, gap: spacing.lg, paddingBottom: 40 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
    },
    backButton: { padding: spacing.sm, marginLeft: -spacing.sm },
    headerTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    error: {
      fontSize: 13,
      color: colors.danger,
      backgroundColor: colors.expenseBg,
      padding: spacing.md,
      borderRadius: radius.md,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    sectionText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    scoreLabel: {
      fontSize: 20,
      fontWeight: "800",
      marginTop: spacing.sm,
    },
    summary: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.xs,
    },
    suggestion: {
      fontSize: 13,
      color: colors.primary,
      textAlign: "center",
      fontWeight: "600",
      marginTop: spacing.xs,
    },
    riskItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    bullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 6,
    },
    riskText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    pillarCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    pillarHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    pillarLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    pillarStatus: {
      fontSize: 11,
      fontWeight: "600",
    },
    pillarScore: {
      fontSize: 22,
      fontWeight: "800",
    },
    progressBarBg: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressBarFill: {
      height: 6,
      borderRadius: 3,
    },
    pillarDescription: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    pillarSuggestion: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    summaryItem: {
      width: (SCREEN_WIDTH - CARD_PADDING * 2 - spacing.md * 3) / 2,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 4,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.textMuted,
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
    },
  });
}
