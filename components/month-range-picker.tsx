import { EditModal } from "@/components/account/edit-modal";
import { Button } from "@/components/ui/button";
import {
  formatMonthRangeLabel,
  monthCount,
  monthDiff,
  monthRangePreset,
  toMonthRange,
  type MonthRange,
  type MonthRangePreset,
  type MonthRef,
} from "@/lib/repositories/dre";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const PRESETS: { key: MonthRangePreset; label: string }[] = [
  { key: "current", label: "Este mês" },
  { key: "last3", label: "Últimos 3" },
  { key: "last6", label: "Últimos 6" },
  { key: "yearToDate", label: "Este ano" },
];

interface MonthRangePickerProps {
  visible: boolean;
  value: MonthRange;
  /** Mês financeiro atual (destaque e base dos atalhos) */
  current: MonthRef;
  onApply: (range: MonthRange) => void;
  onClose: () => void;
}

/**
 * Seletor de um mês ou de um intervalo de meses: um toque escolhe o mês,
 * um segundo toque em outro mês fecha o intervalo.
 */
export function MonthRangePicker({ visible, value, current, onApply, onClose }: Readonly<MonthRangePickerProps>) {
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<MonthRange>(value);
  // Primeiro mês tocado, aguardando o segundo para formar o intervalo
  const [anchor, setAnchor] = useState<MonthRef | null>(null);
  const [year, setYear] = useState(value.end.year);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setAnchor(null);
    setYear(value.end.year);
  }, [visible, value]);

  const selectMonth = (month: MonthRef) => {
    if (anchor) {
      setDraft(toMonthRange(anchor, month));
      setAnchor(null);
    } else {
      setDraft({ start: month, end: month });
      setAnchor(month);
    }
  };

  const applyPreset = (preset: MonthRangePreset) => {
    const range = monthRangePreset(preset, current);
    setDraft(range);
    setAnchor(null);
    setYear(range.end.year);
  };

  const count = monthCount(draft);
  const hint = anchor
    ? "Toque em outro mês para escolher um intervalo, ou aplique para ver só este mês."
    : `${formatMonthRangeLabel(draft)} · ${count} ${count === 1 ? "mês" : "meses"}`;

  return (
    <EditModal
      visible={visible}
      title="Período do relatório"
      onClose={onClose}
      footer={
        <>
          <Button title="Aplicar" onPress={() => onApply(draft)} />
          <Button title="Cancelar" onPress={onClose} variant="ghost" />
        </>
      }
    >
      <View style={styles.presets}>
        {PRESETS.map((preset) => (
          <TouchableOpacity key={preset.key} style={styles.presetChip} onPress={() => applyPreset(preset.key)}>
            <Text style={styles.presetText}>{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={10} accessibilityLabel="Ano anterior">
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}</Text>
        <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={10} accessibilityLabel="Próximo ano">
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {MONTHS.map((label, month) => {
          const ref = { year, month };
          const inRange = monthDiff(draft.start, ref) >= 0 && monthDiff(ref, draft.end) >= 0;
          const isEdge = monthDiff(draft.start, ref) === 0 || monthDiff(ref, draft.end) === 0;
          const isCurrent = monthDiff(current, ref) === 0;
          return (
            <Pressable
              key={label}
              onPress={() => selectMonth(ref)}
              style={[
                styles.monthCell,
                inRange && styles.monthInRange,
                isEdge && styles.monthEdge,
                isCurrent && !isEdge && styles.monthCurrent,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: inRange }}
              accessibilityLabel={`${label} ${year}`}
            >
              <Text style={[styles.monthText, inRange && styles.monthTextInRange, isEdge && styles.monthTextEdge]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>{hint}</Text>
    </EditModal>
  );
}

function createStyles() {
  return StyleSheet.create({
    presets: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    presetChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    presetText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl },
    yearText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, minWidth: 60, textAlign: "center" },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm },
    monthCell: {
      width: "31%",
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: "center",
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: "transparent",
    },
    monthInRange: { backgroundColor: colors.primary + "22" },
    monthEdge: { backgroundColor: colors.primary },
    monthCurrent: { borderColor: colors.primary },
    monthText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    monthTextInRange: { color: colors.primary },
    monthTextEdge: { color: colors.textInverse },
    hint: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  });
}
