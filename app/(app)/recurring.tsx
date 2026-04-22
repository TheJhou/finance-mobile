import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  deleteRecurring,
  listRecurring,
  toggleRecurringActive,
} from "@/lib/repositories/recurring";
import { formatCurrency, formatDate } from "@/lib/utils";
import { colors, radius, spacing } from "@/lib/theme";
import type { RecurringTransaction } from "@/lib/types";

const frequencyLabel: Record<RecurringTransaction["frequency"], string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

export default function RecurringScreen() {
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await listRecurring();
      setItems(res);
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

  const handleLongPress = (item: RecurringTransaction) => {
    Alert.alert(item.description, "O que deseja fazer?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: item.isActive ? "Desativar" : "Ativar",
        onPress: async () => {
          try {
            await toggleRecurringActive(item.id, !item.isActive);
            fetchItems();
          } catch (err) {
            Alert.alert(
              "Erro",
              err instanceof Error ? err.message : "Falha"
            );
          }
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRecurring(item.id);
            fetchItems();
          } catch (err) {
            Alert.alert(
              "Erro",
              err instanceof Error ? err.message : "Falha ao excluir"
            );
          }
        },
      },
    ]);
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
      <View style={styles.header}>
        <Text style={styles.title}>Recorrentes</Text>
        <Text style={styles.subtitle}>{items.length} registros</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="refresh-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Nenhuma recorrência</Text>
            <Text style={styles.emptyHint}>
              Em breve: criar recorrentes pelo app.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isIncome = item.type === "INCOME";
          return (
            <Pressable onLongPress={() => handleLongPress(item)}>
              <View
                style={[styles.card, { opacity: item.isActive ? 1 : 0.55 }]}
              >
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
                    name="refresh"
                    size={18}
                    color={isIncome ? colors.incomeFg : colors.expenseFg}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.desc} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={styles.meta}>
                    {frequencyLabel[item.frequency]} · Próx.{" "}
                    {formatDate(item.nextDueDate)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.amount,
                      { color: isIncome ? colors.incomeFg : colors.expenseFg },
                    ]}
                  >
                    {formatCurrency(item.amount)}
                  </Text>
                  <Text style={styles.status}>
                    {item.isActive ? "Ativa" : "Inativa"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    marginHorizontal: spacing.lg,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: "#fee2e2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
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
  status: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
});
