import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import BankNotifications, {
  type BankNotificationEvent,
} from "@/modules/bank-notifications";
import {
  parseNotification,
  type ParsedTransaction,
} from "@/lib/notifications/parsers";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { formatCurrency, toDateInputValue } from "@/lib/utils";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category } from "@/lib/types";

interface PendingItem extends ParsedTransaction {
  key: string;
  raw: string;
  postTime: number;
}

export default function NotificationsScreen() {
  const [granted, setGranted] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const seenRef = useRef<Set<string>>(new Set());

  const checkPermission = useCallback(() => {
    try {
      setGranted(BankNotifications.isPermissionGranted());
    } catch {
      setGranted(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const cats = await listCategories();
    setCategories(cats);
    if (cats.length > 0) {
      setSelectedCategoryId((prev) => prev ?? cats[0].id);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermission();
      loadCategories();
    }, [checkPermission, loadCategories])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  useEffect(() => {
    const sub = BankNotifications.addListener(
      "onNotification",
      (event: BankNotificationEvent) => {
        const parsed = parseNotification(event);
        if (!parsed) return;
        const key = `${event.packageName}|${event.postTime}|${parsed.amount}|${parsed.description}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);

        setPending((prev) => [
          {
            ...parsed,
            key,
            raw: [event.title, event.bigText ?? event.text]
              .filter(Boolean)
              .join(" — "),
            postTime: event.postTime,
          },
          ...prev,
        ]);
      }
    );
    return () => {
      sub.remove();
    };
  }, []);

  const handleImport = async (item: PendingItem) => {
    if (!selectedCategoryId) {
      Alert.alert("Categoria", "Selecione uma categoria padrão antes de importar.");
      return;
    }
    try {
      await createTransaction({
        description: item.description,
        amount: item.amount,
        type: item.type,
        paymentMethod: item.paymentMethod,
        date: toDateInputValue(new Date(item.postTime)),
        categoryId: selectedCategoryId,
        notes: `Importado de ${item.bank}`,
      });
      setPending((prev) => prev.filter((p) => p.key !== item.key));
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao salvar"
      );
    }
  };

  const handleDiscard = (item: PendingItem) => {
    setPending((prev) => prev.filter((p) => p.key !== item.key));
  };

  const openSettings = () => {
    try {
      BankNotifications.openPermissionSettings();
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao abrir"
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Importar</Text>
        <Text style={styles.subtitle}>
          Capture notificações de bancos automaticamente
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.permissionCard,
            {
              borderColor: granted ? colors.incomeFg : colors.warning,
              backgroundColor: granted ? colors.incomeBg : "#fef3c7",
            },
          ]}
        >
          <Ionicons
            name={granted ? "checkmark-circle" : "alert-circle"}
            size={24}
            color={granted ? colors.incomeFg : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.permissionTitle}>
              {granted ? "Acesso liberado" : "Precisa autorizar"}
            </Text>
            <Text style={styles.permissionText}>
              {granted
                ? "O app está capturando suas notificações bancárias."
                : "Abra as configurações do Android e dê acesso ao Finance App na lista de leitores de notificação."}
            </Text>
          </View>
          {!granted && (
            <Button title="Abrir" onPress={openSettings} variant="secondary" />
          )}
        </View>

        {categories.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionLabel}>Categoria padrão ao importar</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {categories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSelectedCategoryId(cat.id)}
                    style={[
                      styles.pill,
                      active && { backgroundColor: cat.color, borderColor: cat.color },
                    ]}
                  >
                    <View
                      style={[styles.pillDot, { backgroundColor: cat.color }]}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        active && { color: colors.textInverse },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionLabel}>
            Pendentes ({pending.length})
          </Text>
          {pending.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="notifications-off-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>Nada por aqui ainda</Text>
              <Text style={styles.emptyHint}>
                Quando chegar uma notificação de banco (Nubank, Inter, C6,
                PicPay...), ela aparece aqui pra você confirmar a importação.
              </Text>
            </View>
          ) : (
            <FlatList
              data={pending}
              keyExtractor={(item) => item.key}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing.sm }} />
              )}
              renderItem={({ item }) => {
                const isIncome = item.type === "INCOME";
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isIncome
                              ? colors.incomeBg
                              : colors.expenseBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: isIncome
                                ? colors.incomeFg
                                : colors.expenseFg,
                            },
                          ]}
                        >
                          {isIncome ? "Receita" : "Despesa"} · {item.bank}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.cardAmount,
                          {
                            color: isIncome ? colors.incomeFg : colors.expenseFg,
                          },
                        ]}
                      >
                        {formatCurrency(item.amount)}
                      </Text>
                    </View>
                    <Text style={styles.cardDesc}>{item.description}</Text>
                    <Text style={styles.cardRaw} numberOfLines={2}>
                      {item.raw}
                    </Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.discardButton}
                        onPress={() => handleDiscard(item)}
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.discardText}>Descartar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.importButton}
                        onPress={() => handleImport(item)}
                      >
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.textInverse}
                        />
                        <Text style={styles.importText}>Importar</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  permissionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  permissionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  permissionText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },

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

  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  emptyHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },

  card: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardAmount: { fontSize: 18, fontWeight: "700" },
  cardDesc: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  cardRaw: { fontSize: 12, color: colors.textMuted },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  discardButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  discardText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  importButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  importText: { fontSize: 13, color: colors.textInverse, fontWeight: "600" },
});
