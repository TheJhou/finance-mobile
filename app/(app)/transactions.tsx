import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractTransactionFromPhoto } from "@/lib/ai";
import { isAuthenticated } from "@/lib/auth";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    UIManager,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DatePreset = "today" | "week" | "month" | "year" | "all";

interface Filters {
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  type: TransactionType | "ALL";
  categoryIds: string[];
  amountMin: string;
  amountMax: string;
}

const INITIAL_FILTERS: Filters = {
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  type: "ALL",
  categoryIds: [],
  amountMin: "",
  amountMax: "",
};

function getDateRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === "all") return null;
  const now = new Date();
  const to = toDateInputValue(now);
  let from: string;
  switch (preset) {
    case "today":
      from = to;
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      from = toDateInputValue(d);
      break;
    }
    case "month": {
      // Correção: usar o primeiro dia do mês atual
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      from = toDateInputValue(d);
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

function isFiltersActive(f: Filters): boolean {
  return (
    f.datePreset !== "all" ||
    f.dateFrom !== "" ||
    f.dateTo !== "" ||
    f.type !== "ALL" ||
    f.categoryIds.length > 0 ||
    f.amountMin !== "" ||
    f.amountMax !== ""
  );
}

function activeFilterCount(f: Filters): number {
  let c = 0;
  if (f.datePreset !== "all" || f.dateFrom || f.dateTo) c++;
  if (f.type !== "ALL") c++;
  if (f.categoryIds.length > 0) c++;
  if (f.amountMin || f.amountMax) c++;
  return c;
}

export default function TransactionsScreen() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  const fetchItems = useCallback(async () => {
    try {
      const [res, cats] = await Promise.all([
        listTransactions(),
        listCategories(),
      ]);
      setItems(res);
      setCategories(cats);
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

  const filteredItems = useMemo(() => {
    let result = items;

    // Date preset
    const range = getDateRange(filters.datePreset);
    if (range) {
      result = result.filter((t) => t.date >= range.from && t.date <= range.to);
    }
    // Custom date range (overrides preset if both filled)
    if (filters.dateFrom) {
      result = result.filter((t) => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((t) => t.date <= filters.dateTo);
    }
    // Type
    if (filters.type !== "ALL") {
      result = result.filter((t) => t.type === filters.type);
    }
    // Categories
    if (filters.categoryIds.length > 0) {
      result = result.filter((t) => filters.categoryIds.includes(t.categoryId));
    }
    // Amount
    const min = parseFloat(filters.amountMin.replace(",", "."));
    const max = parseFloat(filters.amountMax.replace(",", "."));
    if (Number.isFinite(min) && min > 0) {
      result = result.filter((t) => Number(t.amount) >= min);
    }
    if (Number.isFinite(max) && max > 0) {
      result = result.filter((t) => Number(t.amount) <= max);
    }

    return result;
  }, [items, filters]);

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((v) => !v);
  };

  const clearFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilters(INITIAL_FILTERS);
  };

  const toggleCategory = (id: string) => {
    setFilters((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }));
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

  const filterCount = activeFilterCount(filters);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transações</Text>
          <Text style={styles.subtitle}>
            {filteredItems.length}
            {filteredItems.length !== items.length
              ? ` de ${items.length}`
              : ""}{" "}
            registros
          </Text>
        </View>
        <Pressable
          style={[
            styles.filterToggle,
            showFilters && styles.filterToggleActive,
          ]}
          onPress={toggleFilters}
          hitSlop={6}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={showFilters ? colors.textInverse : colors.primary}
          />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Date presets */}
            <Text style={styles.filterLabel}>Período</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {(
                [
                  { key: "today", label: "Hoje" },
                  { key: "week", label: "Semana" },
                  { key: "month", label: "Mês" },
                  { key: "year", label: "Ano" },
                  { key: "all", label: "Tudo" },
                ] as { key: DatePreset; label: string }[]
              ).map((p) => (
                <Pressable
                  key={p.key}
                  style={[
                    styles.chip,
                    filters.datePreset === p.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      datePreset: p.key,
                      dateFrom: "",
                      dateTo: "",
                    }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.datePreset === p.key && styles.chipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Custom date range */}
            <View style={styles.dateRangeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabelSm}>De</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.dateFrom}
                  onChangeText={(v) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateFrom: v,
                      datePreset: "all",
                    }))
                  }
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabelSm}>Até</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.dateTo}
                  onChangeText={(v) =>
                    setFilters((prev) => ({
                      ...prev,
                      dateTo: v,
                      datePreset: "all",
                    }))
                  }
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>

            {/* Type filter */}
            <Text style={styles.filterLabel}>Tipo</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: "ALL", label: "Todos" },
                  { key: "EXPENSE", label: "Despesas" },
                  { key: "INCOME", label: "Receitas" },
                ] as { key: TransactionType | "ALL"; label: string }[]
              ).map((t) => (
                <Pressable
                  key={t.key}
                  style={[
                    styles.chip,
                    filters.type === t.key && styles.chipActive,
                  ]}
                  onPress={() =>
                    setFilters((prev) => ({ ...prev, type: t.key }))
                  }
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.type === t.key && styles.chipTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Value range */}
            <Text style={styles.filterLabel}>Valor (R$)</Text>
            <View style={styles.dateRangeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabelSm}>Mín</Text>
                <TextInput
                  style={styles.filterInput}
                  value={filters.amountMin}
                  onChangeText={(v) =>
                    setFilters((prev) => ({ ...prev, amountMin: v }))
                  }
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
                  onChangeText={(v) =>
                    setFilters((prev) => ({ ...prev, amountMax: v }))
                  }
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Categories */}
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
                          selected && {
                            backgroundColor: cat.color,
                            borderColor: cat.color,
                          },
                        ]}
                        onPress={() => toggleCategory(cat.id)}
                      >
                        <View
                          style={[
                            styles.catDot,
                            {
                              backgroundColor: selected
                                ? "rgba(255,255,255,0.8)"
                                : cat.color,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.catChipText,
                            selected && { color: "#fff" },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Clear button */}
            {isFiltersActive(filters) && (
              <Pressable style={styles.clearBtn} onPress={clearFilters}>
                <Ionicons name="close-circle" size={16} color={colors.danger} />
                <Text style={styles.clearBtnText}>Limpar filtros</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={isFiltersActive(filters) ? "filter-outline" : "document-text-outline"}
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {isFiltersActive(filters)
                ? "Nenhum resultado"
                : "Nenhuma transação ainda"}
            </Text>
            <Text style={styles.emptyHint}>
              {isFiltersActive(filters)
                ? "Tente ajustar os filtros."
                : "Toque no botão + para adicionar a primeira."}
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.desc} numberOfLines={1}>
                    {item.description}
                  </Text>
                  {item.paymentMethod === "BOLETO" && (
                    <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                  )}
                </View>
                <Text style={styles.meta}>
                  {item.category?.name ?? "Sem categoria"} ·{" "}
                  {formatDate(item.date)}
                  {item.paymentMethod === "BOLETO" && " · Boleto"}
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [documentType, setDocumentType] = useState<DocumentType>("NORMAL");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [boletoNumber, setBoletoNumber] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const documentTypeOptions: { label: string; value: DocumentType }[] = [
    { label: "Gasto Normal", value: "NORMAL" },
    { label: "Boleto", value: "BOLETO" },
    { label: "Nota Fiscal", value: "NOTA_FISCAL" },
    { label: "Comprovante PIX", value: "COMPROVANTE_PIX" },
    { label: "Comprovante Bancário", value: "COMPROVANTE_BANCARIO" },
    { label: "Outro", value: "OUTRO" },
  ];

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
      setPaymentMethod(editingItem.paymentMethod);
      setDocumentType(editingItem.documentType);
      setDate(editingItem.date);
      setCategoryId(editingItem.categoryId);
      setBoletoNumber(editingItem.boletoNumber ?? "");
      setCnpj(editingItem.cnpj ?? "");
      setRecipientName(editingItem.recipientName ?? "");
    } else {
      setDescription("");
      setAmount("");
      setType("EXPENSE");
      setPaymentMethod("CASH");
      setDocumentType("NORMAL");
      setDate(toDateInputValue(new Date()));
      setCategoryId(null);
      setBoletoNumber("");
      setCnpj("");
      setRecipientName("");
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
      console.log("[Transactions] Iniciando extração de foto");
      const extracted = await extractTransactionFromPhoto(
        base64,
        (asset.mimeType ?? "image/jpeg") as string
      );
      console.log("[Transactions] Dados extraídos:", JSON.stringify(extracted));
      setDescription(extracted.description);
      setAmount(extracted.amount.toString());
      setType(extracted.type);
      setPaymentMethod((extracted.paymentMethod as PaymentMethod) ?? "CASH");
      setDocumentType((extracted.documentType as DocumentType) ?? "NORMAL");
      setDate(extracted.date);
      setBoletoNumber(extracted.boletoNumber ?? "");
      setCnpj(extracted.cnpj ?? "");
      setRecipientName(extracted.recipientName ?? "");
      console.log("[Transactions] Campos preenchidos");
      if (extracted.categoryName) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === extracted.categoryName!.toLowerCase()
        );
        if (match) setCategoryId(match.id);
      }
      console.log("[Transactions] Extração concluída com sucesso");
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
          paymentMethod,
          documentType,
          date,
          categoryId,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
        });
      } else {
        await createTransaction({
          description: description.trim(),
          amount: parsedAmount,
          type,
          paymentMethod,
          documentType,
          date,
          categoryId,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
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

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Tipo de Documento</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {documentTypeOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.pill,
                      documentType === option.value && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setDocumentType(option.value)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        documentType === option.value && { color: colors.textInverse },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
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
              <Text style={styles.label}>Método de Pagamento</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {[
                  { id: "CASH", label: "Dinheiro", icon: "cash-outline" },
                  { id: "PIX", label: "PIX", icon: "qr-code" },
                  { id: "CREDIT_CARD", label: "Crédito", icon: "card" },
                  { id: "DEBIT_CARD", label: "Débito", icon: "card" },
                  { id: "BOLETO", label: "Boleto", icon: "document-text" },
                  { id: "BANK_TRANSFER", label: "Transferência", icon: "swap-horizontal" },
                  { id: "MERCADO_PAGO", label: "Mercado Pago", icon: "logo-usd" },
                  { id: "OTHER", label: "Outro", icon: "ellipsis-horizontal" },
                ].map((method) => (
                  <Pressable
                    key={method.id}
                    style={[
                      styles.pill,
                      paymentMethod === method.id && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setPaymentMethod(method.id as PaymentMethod)}
                  >
                    <Ionicons
                      name={method.icon as any}
                      size={16}
                      color={paymentMethod === method.id ? colors.textInverse : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        paymentMethod === method.id && { color: colors.textInverse },
                      ]}
                    >
                      {method.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {paymentMethod === "BOLETO" && (
              <>
                <Input
                  label="Número do Boleto"
                  value={boletoNumber}
                  onChangeText={setBoletoNumber}
                  placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />

                <Input
                  label="CNPJ (opcional)"
                  value={cnpj}
                  onChangeText={setCnpj}
                  placeholder="00.000.000/0000-00"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                />

                <Input
                  label="Nome do Beneficiário"
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Nome da empresa ou pessoa"
                  autoCapitalize="words"
                />
              </>
            )}

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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  filterToggle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },

  filterPanel: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxHeight: 340,
    borderWidth: 1,
    borderColor: colors.border,
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

  error: {
    marginHorizontal: spacing.lg,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.expenseBg,
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
