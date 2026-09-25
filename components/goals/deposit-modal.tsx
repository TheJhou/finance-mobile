import { EditModal } from "@/components/account/edit-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoalData } from "@/lib/backend";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { formatCurrency, formatCurrencyInput } from "@/lib/utils";
import { Pressable, StyleSheet, Text, View } from "react-native";

const QUICK_AMOUNTS = [50, 100, 200, 500];

interface Props {
  goal: GoalData | null;
  amount: string;
  error: string | null;
  saving: boolean;
  onChangeAmount: (amount: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function DepositModal({ goal, amount, error, saving, onChangeAmount, onConfirm, onClose }: Readonly<Props>) {
  const styles = useThemedStyles(createStyles);

  return (
    <EditModal
      visible={goal !== null}
      title={goal ? `Depositar em "${goal.name}"` : "Depositar"}
      onClose={onClose}
      footer={
        <>
          <Button title="Depositar" onPress={onConfirm} loading={saving} />
          <Button title="Cancelar" variant="ghost" onPress={onClose} disabled={saving} />
        </>
      }
    >
      {goal ? (
        <Text style={styles.info}>
          Guardado: {formatCurrency(goal.savedValue)} · faltam {formatCurrency(goal.remaining)}
        </Text>
      ) : null}
      <Input
        label="Valor (R$)"
        value={amount}
        onChangeText={onChangeAmount}
        keyboardType="decimal-pad"
        placeholder="0,00"
        autoFocus
        error={error ?? undefined}
      />
      <View style={styles.chips}>
        {goal && goal.remaining > 0 ? (
          <Pressable style={styles.chip} onPress={() => onChangeAmount(formatCurrencyInput(goal.remaining))}>
            <Text style={styles.chipText}>Completar</Text>
          </Pressable>
        ) : null}
        {QUICK_AMOUNTS.map((value) => (
          <Pressable key={value} style={styles.chip} onPress={() => onChangeAmount(formatCurrencyInput(value))}>
            <Text style={styles.chipText}>{formatCurrency(value)}</Text>
          </Pressable>
        ))}
      </View>
    </EditModal>
  );
}

function createStyles() {
  return StyleSheet.create({
    info: { fontSize: 13, color: colors.textSecondary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  });
}
