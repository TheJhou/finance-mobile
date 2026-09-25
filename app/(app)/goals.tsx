import { ScreenLayout } from "@/components/account/screen-layout";
import { DepositModal } from "@/components/goals/deposit-modal";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalFormModal } from "@/components/goals/goal-form-modal";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { createGoal, deleteGoal, depositGoal, getGoals, updateGoal, type GoalData } from "@/lib/backend";
import {
  emptyGoalForm,
  goalToForm,
  newIdempotencyKey,
  parseGoalForm,
  sortGoals,
  summarizeGoals,
  type GoalForm,
  type GoalFormErrors,
} from "@/lib/goals";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from "react-native";

type FormState = { mode: "create" | "edit"; goal: GoalData | null; form: GoalForm; errors: GoalFormErrors; key: string };

export default function GoalsScreen() {
  const styles = useThemedStyles(createStyles);
  const { alert, confirm, dialog } = useAppDialog();
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FormState | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  const [depositTarget, setDepositTarget] = useState<GoalData | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositError, setDepositError] = useState<string | null>(null);
  // Mesma chave nas novas tentativas do mesmo depósito: evita somar duas vezes
  const [depositKey, setDepositKey] = useState("");
  const [depositing, setDepositing] = useState(false);

  const load = useCallback(async () => {
    try {
      setGoals(sortGoals(await getGoals()));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar as metas");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openCreate = () =>
    setFormState({ mode: "create", goal: null, form: emptyGoalForm(), errors: {}, key: newIdempotencyKey() });

  const openEdit = (goal: GoalData) =>
    setFormState({ mode: "edit", goal, form: goalToForm(goal), errors: {}, key: newIdempotencyKey() });

  const saveForm = async () => {
    if (!formState) return;
    const parsed = parseGoalForm(formState.form);
    if (!parsed.ok) {
      setFormState({ ...formState, errors: parsed.errors });
      return;
    }
    setSavingForm(true);
    try {
      if (formState.mode === "create") {
        // Na criação o backend não aceita prazo nulo: sem prazo, o campo não vai
        await createGoal({ ...parsed.data, deadline: parsed.data.deadline ?? undefined }, formState.key);
      } else if (formState.goal) {
        await updateGoal(formState.goal.id, parsed.data);
      }
      setFormState(null);
      await load();
    } catch (err) {
      alert("Não foi possível salvar", err instanceof Error ? err.message : "Tente novamente.", { variant: "danger" });
    } finally {
      setSavingForm(false);
    }
  };

  const askDelete = () => {
    const goal = formState?.goal;
    if (!goal) return;
    confirm("Excluir meta", `A meta "${goal.name}" e o valor registrado nela serão excluídos.`, {
      variant: "danger",
      confirmText: "Excluir",
      onConfirm: async () => {
        try {
          await deleteGoal(goal.id);
          setFormState(null);
          await load();
        } catch (err) {
          alert("Não foi possível excluir", err instanceof Error ? err.message : "Tente novamente.", { variant: "danger" });
        }
      },
    });
  };

  const openDeposit = (goal: GoalData) => {
    setDepositTarget(goal);
    setDepositAmount("");
    setDepositError(null);
    setDepositKey(newIdempotencyKey());
  };

  const confirmDeposit = async () => {
    if (!depositTarget) return;
    const amount = parseCurrencyInput(depositAmount);
    if (!(amount > 0)) {
      setDepositError("Informe um valor maior que zero");
      return;
    }
    setDepositing(true);
    try {
      await depositGoal(depositTarget.id, Math.round(amount * 100) / 100, depositKey);
      const reached = depositTarget.savedValue + amount >= depositTarget.targetValue;
      setDepositTarget(null);
      await load();
      if (reached) alert("Meta concluída!", `Você chegou ao valor de "${depositTarget.name}".`, { variant: "success" });
    } catch (err) {
      // Mantém a mesma chave: se o depósito chegou ao servidor, a nova tentativa não soma de novo
      setDepositError(err instanceof Error ? err.message : "Não foi possível depositar");
    } finally {
      setDepositing(false);
    }
  };

  const summary = summarizeGoals(goals);

  return (
    <ScreenLayout
      title="Metas"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loading} />
      ) : loadError && goals.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>{loadError}</Text>
          <Button title="Tentar de novo" variant="secondary" onPress={() => { setLoading(true); void load(); }} />
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="flag-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Crie sua primeira meta</Text>
          <Text style={styles.emptyText}>
            Uma viagem, a reserva de emergência, um carro novo: defina o valor, o prazo e acompanhe cada depósito.
          </Text>
          <Button title="Criar meta" onPress={openCreate} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Total guardado</Text>
            <Text style={styles.heroValue}>{formatCurrency(summary.saved)}</Text>
            <Text style={styles.heroSub}>de {formatCurrency(summary.target)} · {summary.percent}%</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${summary.percent}%` }]} />
            </View>
            <Text style={styles.heroSub}>
              {summary.count} {summary.count === 1 ? "meta" : "metas"}
              {summary.done > 0 ? ` · ${summary.done} ${summary.done === 1 ? "concluída" : "concluídas"}` : ""}
            </Text>
          </View>

          <Button title="Nova meta" onPress={openCreate} />

          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onDeposit={() => openDeposit(goal)} onEdit={() => openEdit(goal)} />
          ))}
        </>
      )}

      <GoalFormModal
        visible={formState !== null}
        mode={formState?.mode ?? "create"}
        form={formState?.form ?? emptyGoalForm()}
        errors={formState?.errors ?? {}}
        saving={savingForm}
        onChange={(form) => formState && setFormState({ ...formState, form, errors: {} })}
        onSave={() => void saveForm()}
        onDelete={askDelete}
        onClose={() => !savingForm && setFormState(null)}
      />
      <DepositModal
        goal={depositTarget}
        amount={depositAmount}
        error={depositError}
        saving={depositing}
        onChangeAmount={(amount) => {
          setDepositAmount(amount);
          setDepositError(null);
        }}
        onConfirm={() => void confirmDeposit()}
        onClose={() => !depositing && setDepositTarget(null)}
      />
      {dialog}
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    loading: { marginTop: spacing["3xl"] },
    hero: {
      alignItems: "center",
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    heroLabel: { fontSize: 13, color: colors.textSecondary },
    heroValue: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
    heroSub: { fontSize: 12, color: colors.textMuted },
    barBg: {
      alignSelf: "stretch",
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
      marginVertical: spacing.xs,
    },
    barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
    emptyCard: {
      alignItems: "center",
      paddingVertical: spacing["2xl"],
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  });
}
