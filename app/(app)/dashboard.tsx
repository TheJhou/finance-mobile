import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { PieChart, BarChart } from "react-native-gifted-charts";
import { getDashboard } from "@/lib/repositories/dashboard";
import { formatCurrency } from "@/lib/utils";
import { colors, radius, spacing } from "@/lib/theme";
import type { DashboardData } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getDashboard();
      setData(res);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.subtitle}>Resumo da sua conta</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {data && (
          <>
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <Ionicons
                  name="wallet-outline"
                  size={20}
                  color={colors.primaryLight}
                />
                <Text style={styles.balanceLabel}>Saldo disponível</Text>
              </View>
              <Text style={styles.balanceValue}>
                {formatCurrency(data.balance)}
              </Text>
              <View style={styles.balanceMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="arrow-up-outline" size={16} color="#86efac" />
                  <Text style={styles.metaText}>
                    Receitas {formatCurrency(data.monthlyIncome)}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons
                    name="arrow-down-outline"
                    size={16}
                    color="#fca5a5"
                  />
                  <Text style={styles.metaText}>
                    Gastos {formatCurrency(data.monthlyExpense)}
                  </Text>
                </View>
              </View>
            </View>

            {data.overdueAmount > 0 && (
              <View
                style={[
                  styles.alertCard,
                  { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={22}
                  color={colors.danger}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>Contas vencidas</Text>
                  <Text style={[styles.alertValue, { color: "#991b1b" }]}>
                    {formatCurrency(data.overdueAmount)}
                  </Text>
                </View>
              </View>
            )}

            {data.upcomingAmount > 0 && (
              <View
                style={[
                  styles.alertCard,
                  { backgroundColor: "#fef3c7", borderColor: "#fcd34d" },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color={colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>Contas a vencer</Text>
                  <Text style={[styles.alertValue, { color: "#92400e" }]}>
                    {formatCurrency(data.upcomingAmount)}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Pendentes</Text>
                <Text style={styles.statValue}>{data.pendingCount}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Recorrentes ativos</Text>
                <Text style={styles.statValue}>{data.activeRecurring}</Text>
              </View>
            </View>

            {data.expensesByCategory.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Gastos por categoria</Text>
                <PieChart
                  data={data.expensesByCategory.map((cat) => ({
                    value: cat.value,
                    color: cat.color,
                    label: cat.name,
                  }))}
                  donut
                  showText
                  textColor={colors.textPrimary}
                  textSize={11}
                  innerCircleColor={colors.surface}
                  innerCircleBorderWidth={0}
                  radius={90}
                  innerRadius={55}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>Total</Text>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textPrimary }}>
                        {formatCurrency(data.monthlyExpense)}
                      </Text>
                    </View>
                  )}
                />
                <View style={styles.categoryList}>
                  {data.expensesByCategory.map((cat) => (
                    <View key={cat.name} style={styles.categoryRow}>
                      <View style={styles.categoryRowLeft}>
                        <View
                          style={[
                            styles.categoryDot,
                            { backgroundColor: cat.color },
                          ]}
                        />
                        <Text style={styles.categoryName}>{cat.name}</Text>
                      </View>
                      <Text style={styles.categoryValue}>
                        {formatCurrency(cat.value)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {data.monthlyTrend.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Tendência mensal</Text>
                <BarChart
                  data={data.monthlyTrend.map((m) => ({
                    label: m.month.slice(5),
                    value: m.expense,
                    frontColor: colors.expenseFg,
                  }))}
                  barWidth={22}
                  spacing={20}
                  roundedTop
                  hideYAxisText={false}
                  yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                  xAxisLabelTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                  noOfSections={4}
                  height={180}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  greeting: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    fontSize: 13,
    color: colors.danger,
    backgroundColor: "#fee2e2",
    padding: spacing.md,
    borderRadius: radius.md,
  },

  balanceCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  balanceLabel: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: "500",
  },
  balanceValue: { fontSize: 32, color: colors.textInverse, fontWeight: "700" },
  balanceMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: colors.textInverse, fontSize: 13 },

  alertCard: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  alertTitle: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  alertValue: { fontSize: 18, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { fontSize: 12, color: colors.textSecondary },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 4,
  },

  sectionCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  categoryList: { gap: spacing.sm },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryDot: { width: 12, height: 12, borderRadius: 6 },
  categoryName: { fontSize: 14, color: colors.textPrimary },
  categoryValue: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
});
