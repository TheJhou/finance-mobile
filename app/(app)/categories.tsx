import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ScrollFade } from "@/components/ui/scroll-fade";
import {
    createCategory,
    deleteCategory,
    listCategories,
} from "@/lib/repositories/categories";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { Category } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
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

const PALETTE = [
  // Vermelhos
  "#ef4444", "#dc2626", "#b91c1c", "#fca5a5",
  // Laranjas
  "#f97316", "#ea580c", "#fb923c", "#fed7aa",
  // Amarelos
  "#eab308", "#ca8a04", "#facc15", "#fde68a",
  // Verdes
  "#22c55e", "#16a34a", "#15803d", "#4ade80",
  "#84cc16", "#65a30d", "#a3e635",
  // Azuis / Ciano
  "#06b6d4", "#0891b2", "#67e8f9",
  "#3b82f6", "#2563eb", "#1d4ed8", "#93c5fd",
  "#0ea5e9", "#0284c7",
  // Roxos / Índigo
  "#6366f1", "#4f46e5", "#818cf8",
  "#a855f7", "#9333ea", "#7e22ce", "#d8b4fe",
  // Rosas
  "#ec4899", "#db2777", "#f9a8d4",
  "#f43f5e", "#e11d48",
  // Neutros
  "#6b7280", "#374151", "#111827",
  "#78716c", "#57534e",
  // Especiais
  "#14b8a6", "#0d9488", "#f59e0b", "#d97706",
];

export default function CategoriesScreen() {
  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string; variant?: "default" | "warning" | "danger" | "success" } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await listCategories();
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

  const handleDelete = (item: Category) => {
    if (item.isDefault) {
      setInfoDialog({ title: "Aviso", message: "Categorias padrão não podem ser excluídas.", variant: "warning" });
      return;
    }
    setConfirmDel(item);
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

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Categorias</Text>
        <Text style={styles.subtitle}>{items.length} categorias</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                {item.isDefault ? (
                  <Text style={styles.badge}>Padrão</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.cardActions}>
              {!item.isDefault ? (
                <Pressable
                  onPress={() => handleDelete(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              ) : (
                <View style={styles.lockIcon}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                </View>
              )}
            </View>
          </View>
        )}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => setShowForm(true)}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <CategoryForm
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          fetchItems();
        }}
        styles={styles}
      />

      <ConfirmDialog
        visible={confirmDel !== null}
        title="Excluir categoria"
        message={`Remover "${confirmDel?.name ?? ""}"?`}
        confirmText="Excluir"
        variant="danger"
        onCancel={() => setConfirmDel(null)}
        onConfirm={async () => {
          if (!confirmDel) return;
          try {
            await deleteCategory(confirmDel.id);
            setConfirmDel(null);
            fetchItems();
          } catch (err) {
            setConfirmDel(null);
            setInfoDialog({ title: "Erro", message: err instanceof Error ? err.message : "Falha ao excluir. Existem transações usando essa categoria?", variant: "danger" });
          }
        }}
      />

      <ConfirmDialog
        visible={infoDialog !== null}
        title={infoDialog?.title ?? ""}
        message={infoDialog?.message ?? ""}
        confirmText="OK"
        cancelText=""
        variant={infoDialog?.variant ?? "default"}
        onCancel={() => setInfoDialog(null)}
        onConfirm={() => setInfoDialog(null)}
      />
      <ScrollFade />
    </SafeAreaView>
  );
}

interface FormProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  styles: ReturnType<typeof createStyles>;
}

function CategoryForm({ visible, onClose, onSaved, styles }: FormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setColor(PALETTE[0]);
    setErr(null);
  }, [visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      setErr("Informe o nome");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await createCategory({ name: name.trim(), color });
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
            <Text style={styles.formTitle}>Nova categoria</Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Ex: Pets"
              autoFocus
            />

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Cor</Text>
              <View style={styles.colorGrid}>
                {PALETTE.map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      color === c && styles.colorSelected,
                    ]}
                    onPress={() => setColor(c)}
                  >
                    {color === c ? (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <Button title="Salvar" onPress={handleSave} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: {
    fontSize: 13,
    color: colors.danger,
    backgroundColor: "#fee2e2",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1, paddingBottom: 96 },
  row: { gap: spacing.sm },
  card: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  badge: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
  formContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  deleteBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.danger + "15",
  },
  lockIcon: {
    padding: spacing.xs,
  },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
});
}
