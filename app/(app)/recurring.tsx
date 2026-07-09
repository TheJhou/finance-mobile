import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCategories } from "@/lib/repositories/categories";
import {
    createRecurring,
    deleteRecurring,
    listRecurring,
    postRecurringTransaction,
    processRecurringDue,
    toggleRecurringActive,
    updateRecurring
} from "@/lib/repositories/recurring";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Category, Frequency, RecurringTransaction, TransactionType } from "@/lib/types";
import { formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInput, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const frequencyLabel: Record<Frequency, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};
const frequencyOptions: Frequency[] = ["WEEKLY", "MONTHLY", "YEARLY"];

function ListSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

export default function RecurringScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postingItem, setPostingItem] = useState<RecurringTransaction | null>(null);
  const [postDate, setPostDate] = useState(toDateInputValue(new Date()));
  const [posting, setPosting] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      await processRecurringDue();
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

  const handleDelete = (item: RecurringTransaction) => {
    Alert.alert("Excluir recorrência", `Remover "${item.description}"?`, [
      { text: "Cancelar", style: "cancel" },
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

  const handleEdit = (item: RecurringTransaction) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleToggle = async (item: RecurringTransaction) => {
    try {
      await toggleRecurringActive(item.id, !item.isActive);
      fetchItems();
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha");
    }
  };

  const handlePost = (item: RecurringTransaction) => {
    setPostingItem(item);
    setPostDate(toDateInputValue(new Date()));
    setShowPostModal(true);
  };

  const confirmPost = async () => {
    if (!postingItem) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) {
      Alert.alert("Data inválida", "Use o formato AAAA-MM-DD");
      return;
    }
    setPosting(true);
    try {
      await postRecurringTransaction(postingItem.id, postDate);
      setShowPostModal(false);
      setPostingItem(null);
      Alert.alert("Sucesso", `"${postingItem.description}" lançada como transação em ${postDate}.`);
      fetchItems();
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao lançar");
    } finally {
      setPosting(false);
    }
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
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
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
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="refresh-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Nenhuma recorrência</Text>
            <Text style={styles.emptyHint}>
              Toque no botão + para adicionar.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isIncome = item.type === "INCOME";
          return (
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
                <View style={styles.actionButtons}>
                  {item.isActive && (
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => handlePost(item)}
                      hitSlop={10}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleToggle(item)}
                    hitSlop={10}
                    >
                    <Ionicons
                      name={item.isActive ? "pause-outline" : "play-outline"}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>
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
        onPress={() => {
          setEditingItem(null);
          setShowForm(true);
        }}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <RecurringForm
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

      {/* Modal: Lançar recorrência em transação */}
      <Modal visible={showPostModal} transparent animationType="slide" onRequestClose={() => setShowPostModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPostModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Lançar transação</Text>
            {postingItem && (
              <Text style={styles.modalSubtitle}>
                {postingItem.description} · {formatCurrency(postingItem.amount)}
              </Text>
            )}
            <Text style={styles.inputLabel}>Data do lançamento (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="2025-06-24"
              placeholderTextColor={colors.textMuted}
              value={postDate}
              onChangeText={setPostDate}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setShowPostModal(false)}
              >
                <Text style={styles.modalBtnTextSecondary}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, posting && { opacity: 0.6 }]}
                onPress={confirmPost}
                disabled={posting}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnTextPrimary}>Lançar</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

interface RecurringFormProps {
  visible: boolean;
  editingItem?: RecurringTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}

function RecurringForm({ visible, editingItem, onClose, onSaved }: Readonly<RecurringFormProps>) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState("");
  const [nextDueDate, setNextDueDate] = useState(toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    listCategories().then((cats) => {
      setCategories(cats);
      if (!editingItem && cats.length > 0) setCategoryId(cats[0].id);
    });
    setErr(null);
  }, [visible, editingItem]);

  useEffect(() => {
    if (editingItem) {
      setDescription(editingItem.description);
      setAmount(formatCurrencyInput(Number(editingItem.amount)));
      setType(editingItem.type);
      setFrequency(editingItem.frequency);
      setStartDate(editingItem.startDate);
      setEndDate(editingItem.endDate ?? "");
      setNextDueDate(editingItem.nextDueDate);
      setCategoryId(editingItem.categoryId);
    } else {
      setDescription("");
      setAmount("");
      setType("EXPENSE");
      setFrequency("MONTHLY");
      setStartDate(toDateInputValue(new Date()));
      setEndDate("");
      setNextDueDate(toDateInputValue(new Date()));
      setCategoryId(null);
    }
  }, [editingItem, visible]);

  const handleSave = async () => {
    const parsedAmount = parseCurrencyInput(amount);
    if (!description.trim()) { setErr("Informe a descrição"); return; }
    if (parsedAmount <= 0) { setErr("Informe um valor válido"); return; }
    if (!categoryId) { setErr("Selecione uma categoria"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { setErr("Data de início inválida"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) { setErr("Próximo vencimento inválido"); return; }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { setErr("Data de fim inválida"); return; }

    setErr(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateRecurring(editingItem.id, {
          description: description.trim(),
          amount: parsedAmount,
          type,
          frequency,
          startDate,
          endDate: endDate || null,
          nextDueDate,
          categoryId,
        });
      } else {
        await createRecurring({
          description: description.trim(),
          amount: parsedAmount,
          type,
          frequency,
          startDate,
          endDate: endDate || null,
          nextDueDate,
          categoryId,
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={formStyles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={formStyles.title}>
              {editingItem ? "Editar recorrência" : "Nova recorrência"}
            </Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView
            contentContainerStyle={formStyles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={formStyles.typeRow}>
              <Pressable
                style={[formStyles.typeButton, type === "EXPENSE" && formStyles.typeButtonActive]}
                onPress={() => setType("EXPENSE")}
              >
                <Ionicons name="arrow-down" size={16} color={type === "EXPENSE" ? colors.expenseFg : colors.textSecondary} />
                <Text style={[formStyles.typeLabel, type === "EXPENSE" && { color: colors.expenseFg }]}>Despesa</Text>
              </Pressable>
              <Pressable
                style={[formStyles.typeButton, type === "INCOME" && formStyles.typeButtonActive]}
                onPress={() => setType("INCOME")}
              >
                <Ionicons name="arrow-up" size={16} color={type === "INCOME" ? colors.incomeFg : colors.textSecondary} />
                <Text style={[formStyles.typeLabel, type === "INCOME" && { color: colors.incomeFg }]}>Receita</Text>
              </Pressable>
            </View>

            <View>
              <Text style={formStyles.label}>Descrição</Text>
              <Input value={description} onChangeText={setDescription} placeholder="Ex: Aluguel" />
            </View>

            <View>
              <Text style={formStyles.label}>Valor</Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />
            </View>

            <View>
              <Text style={formStyles.label}>Frequência</Text>
              <View style={formStyles.freqRow}>
                {frequencyOptions.map((f) => (
                  <Pressable
                    key={f}
                    style={[formStyles.freqButton, frequency === f && formStyles.freqButtonActive]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text style={[formStyles.freqLabel, frequency === f && { color: colors.primary }]}>
                      {frequencyLabel[f]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text style={formStyles.label}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={formStyles.pillRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[
                      formStyles.pill,
                      categoryId === cat.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setCategoryId(cat.id)}
                  >
                    <View style={[formStyles.pillDot, { backgroundColor: cat.color }]} />
                    <Text
                      style={[
                        formStyles.pillText,
                        categoryId === cat.id && { color: colors.textInverse },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View>
              <Text style={formStyles.label}>Data de início</Text>
              <Input value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-DD" />
            </View>

            <View>
              <Text style={formStyles.label}>Próximo vencimento</Text>
              <Input value={nextDueDate} onChangeText={setNextDueDate} placeholder="AAAA-MM-DD" />
            </View>

            <View>
              <Text style={formStyles.label}>Data de fim (opcional)</Text>
              <Input value={endDate} onChangeText={setEndDate} placeholder="AAAA-MM-DD" />
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <Button title="Salvar" onPress={handleSave} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const formStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
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
  typeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  typeLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  freqRow: { flexDirection: "row", gap: spacing.sm },
  freqButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  freqButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "15",
  },
  freqLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
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
});

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    marginHorizontal: spacing.lg,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.expenseBg,
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
  actionButtons: { flexDirection: "row", gap: 4 },
  actionButton: { padding: 6, borderRadius: 4 },
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
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
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
    fontSize: 14,
    color: colors.textSecondary,
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
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
  },
  modalBtnTextSecondary: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 15,
  },
  modalBtnTextPrimary: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  });
}
