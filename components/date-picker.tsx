import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { formatDate, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const startPadding = new Date(year, month, 1 - startDayOfWeek);

  for (let i = 0; i < 42; i++) {
    const day = new Date(startPadding);
    day.setDate(startPadding.getDate() + i);
    days.push(day);
  }

  return days;
}

function sameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isToday(date: Date): boolean {
  return sameDay(date, new Date());
}

export function DatePicker({
  value,
  onChange,
  label = "Data",
  placeholder = "AAAA-MM-DD",
  minDate,
  maxDate,
}: DatePickerProps) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    const d = value ? new Date(value + "T00:00:00") : undefined;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  });
  const [displayMonth, setDisplayMonth] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
  });

  const displayValue = value ? formatDate(value) : "";

  const handleOpen = () => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    setDisplayMonth(d && !Number.isNaN(d.getTime()) ? d : new Date());
    setOpen(true);
  };

  const handleSelect = (date: Date) => {
    if (isDisabled(date)) return;
    setSelectedDate(date);
    onChange(toDateInputValue(date));
    setOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(today);
    onChange(toDateInputValue(today));
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedDate(undefined);
    onChange("");
    setOpen(false);
  };

  const isDisabled = (date: Date): boolean => {
    const dateStr = toDateInputValue(date);
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
  };

  const changeMonth = (delta: number) => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const changeYear = (delta: number) => {
    setDisplayMonth((prev) => new Date(prev.getFullYear() + delta, prev.getMonth(), 1));
  };

  const days = useMemo(
    () => getDaysInMonth(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );

  return (
    <>
      <TouchableOpacity style={styles.inputContainer} onPress={handleOpen} activeOpacity={0.7}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={styles.inputRow}>
          <Text style={[styles.inputValue, !displayValue && styles.placeholder]}>
            {displayValue || placeholder}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Selecionar data</Text>
            <Pressable onPress={handleToday} hitSlop={10}>
              <Text style={styles.todayText}>Hoje</Text>
            </Pressable>
          </View>

          <View style={styles.monthSelector}>
            <Pressable onPress={() => changeYear(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => changeMonth(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.monthText}>
              {MONTHS[displayMonth.getMonth()]} {displayMonth.getFullYear()}
            </Text>
            <Pressable onPress={() => changeMonth(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => changeYear(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAYS.map((day, i) => (
              <Text key={i} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.daysGrid}>
            {Array.from({ length: 6 }, (_, week) => (
              <View key={week} style={styles.weekRow}>
                {days.slice(week * 7, week * 7 + 7).map((date, i) => {
                  const isCurrentMonth = date.getMonth() === displayMonth.getMonth();
                  const selected = selectedDate && sameDay(date, selectedDate);
                  const today = isToday(date);
                  const disabled = isDisabled(date);

                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.dayCell,
                        !isCurrentMonth && styles.dayCellOtherMonth,
                        today && !selected && styles.dayCellToday,
                        selected && styles.dayCellSelected,
                        disabled && styles.dayCellDisabled,
                      ]}
                      onPress={() => handleSelect(date)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !isCurrentMonth && styles.dayTextOtherMonth,
                          today && !selected && styles.dayTextToday,
                          selected && styles.dayTextSelected,
                          disabled && styles.dayTextDisabled,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Limpar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    inputContainer: {
      gap: 6,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 48,
    },
    inputValue: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    placeholder: {
      color: colors.textMuted,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    todayText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
    monthSelector: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
    },
    monthText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      minWidth: 160,
      textAlign: "center",
    },
    weekdays: {
      flexDirection: "row",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xs,
    },
    weekday: {
      flex: 1,
      textAlign: "center",
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
    },
    daysGrid: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    weekRow: {
      flexDirection: "row",
      marginTop: spacing.xs,
    },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      margin: 2,
    },
    dayCellOtherMonth: {
      opacity: 0.4,
    },
    dayCellToday: {
      backgroundColor: colors.primary + "22",
    },
    dayCellSelected: {
      backgroundColor: colors.primary,
    },
    dayCellDisabled: {
      opacity: 0.3,
    },
    dayText: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    dayTextOtherMonth: {
      color: colors.textMuted,
    },
    dayTextToday: {
      color: colors.primary,
      fontWeight: "700",
    },
    dayTextSelected: {
      color: colors.textInverse,
      fontWeight: "700",
    },
    dayTextDisabled: {
      color: colors.textMuted,
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    clearButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.md,
    },
    clearButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.danger,
    },
  });
}
