import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractTransactionFromPhoto } from "@/lib/ai";
import { listCategories } from "@/lib/repositories/categories";
import {
    createTransaction,
    deleteTransaction,
    listTransactions,
    updateTransaction,
} from "@/lib/repositories/transactions";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import { formatCurrency, formatDate, parseCurrencyInput, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TransactionsScreen() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await listTransactions();
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

  const handleDelete = (item: Transaction) => {
    Alert.alert("Excluir transação", `Remover "${item.description}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction(item.id);
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

  const handleEdit = (item: Transaction) => {
    setEditingItem(item);
    setShowForm(true);
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
        <Text style={styles.title}>Transações</Text>
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
              name="document-text-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Nenhuma transação ainda</Text>
            <Text style={styles.emptyHint}>
              Toque no botão + para adicionar a primeira.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isIncome = item.type === "INCOME";
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
                <Text style={styles.desc} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={styles.meta}>
                  {item.category?.name ?? "Sem categoria"} ·{" "}
                  {formatDate(item.date)}
                </Text>
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      setAmount(editingItem.amount.toString());
      setType(editingItem.type);
      setDate(editingItem.date);
      setCategoryId(editingItem.categoryId);
    } else {
      setDescription("");
      setAmount("");
      setType("EXPENSE");
      setDate(toDateInputValue(new Date()));
      setCategoryId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, visible]);

  const handlePhotoScan = async () => {
    try {
      const authed = await isAuthenticated();
      if (!authed) {
        Alert.alert("Login necessário", "Faça login na aba Importar para usar o escaneamento por IA.");
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permissão", "Precisamos de acesso à câmera para escanear recibos.");
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
        (asset.mimeType ?? "image/jpeg") as string
      );
      setDescription(extracted.description);
      setAmount(extracted.amount.toString());
      setType(extracted.type);
      setDate(extracted.date);
      if (extracted.categoryName) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === extracted.categoryName!.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }
    } catch (error) {
      Alert.alert(
        "Erro ao escanear",
        error instanceof Error ? error.message : "Falha ao processar imagem"
      );
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
    setErr(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateTransaction(editingItem.id, {
          description: description.trim(),
          amount: parsedAmount,
          type,
          date,
          categoryId,
        });
      } else {
        await createTransaction({
          description: description.trim(),
          amount: parsedAmount,
          type,
          date,
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
            <Input
              label="Data"
              value={date}
              onChangeText={setDate}
              placeholder="AAAA-MM-DD"
              autoCapitalize="none"
            />

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
    </Modal>
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
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
});
