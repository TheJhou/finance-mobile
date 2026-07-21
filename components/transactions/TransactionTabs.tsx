import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type TabKey = "history" | "payables" | "receivables";

interface TabOption {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TAB_OPTIONS: TabOption[] = [
  { key: "history", label: "Histórico", icon: "checkmark-done-outline" },
  { key: "payables", label: "A pagar", icon: "arrow-down-circle-outline" },
  { key: "receivables", label: "A receber", icon: "arrow-up-circle-outline" },
];

interface TransactionTabsProps {
  readonly activeTab: TabKey;
  readonly onChange: (tab: TabKey) => void;
}

export function TransactionTabs({ activeTab, onChange }: TransactionTabsProps) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  return (
    <View style={styles.container}>
      {TAB_OPTIONS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 9,
      borderRadius: radius.md - 2,
    },
    tabActive: {
      backgroundColor: colors.primary + "18",
    },
    tabLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
    },
    tabLabelActive: {
      color: colors.primary,
    },
  });
}
