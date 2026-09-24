import { HistoryTab } from "@/components/transactions/HistoryTab";
import { PayablesTab, ReceivablesTab } from "@/components/transactions/PayablesTab";
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { TransactionTabs, type TabKey } from "@/components/transactions/TransactionTabs";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import type { Transaction, TransactionStatus, TransactionType } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TransactionsScreen() {
  const styles = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<TabKey>("history");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = (item: Transaction) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const defaultType: TransactionType = activeTab === "receivables" ? "INCOME" : "EXPENSE";
  const defaultStatus: TransactionStatus = activeTab === "history" ? "PAID" : "PENDING";

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transações</Text>
        </View>
      </View>

      <TransactionTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "history" && (
        <HistoryTab onEditTransaction={handleEdit} refreshKey={refreshKey} />
      )}
      {activeTab === "payables" && (
        <PayablesTab onEditTransaction={handleEdit} refreshKey={refreshKey} />
      )}
      {activeTab === "receivables" && (
        <ReceivablesTab onEditTransaction={handleEdit} refreshKey={refreshKey} />
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
        onPress={handleAdd}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <TransactionFormModal
        visible={showForm}
        editingItem={editingItem}
        defaultType={defaultType}
        defaultStatus={defaultStatus}
        onClose={() => {
          setShowForm(false);
          setEditingItem(null);
        }}
        onSaved={() => {
          setShowForm(false);
          setEditingItem(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.lg,
      paddingBottom: spacing.sm,
    },
    title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
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
  });
}
