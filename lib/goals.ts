import type { GoalData, GoalInput } from "@/lib/backend";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils";

const MAX_VALUE = 999_999_999.99;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cores e ícones oferecidos no formulário (o primeiro é o padrão do backend). */
export const GOAL_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#f87171"];
export const GOAL_ICONS = ["trending-up", "airplane", "home", "car", "school", "heart", "gift", "shield-checkmark"] as const;

export interface GoalForm {
  name: string;
  /** Texto digitado, ex.: "1.500,00" */
  target: string;
  /** Valor já guardado (texto); vazio = 0 */
  saved: string;
  /** AAAA-MM-DD ou vazio (sem prazo) */
  deadline: string;
  icon: string;
  color: string;
}

export type GoalFormErrors = Partial<Record<"name" | "target" | "saved" | "deadline", string>>;

export function emptyGoalForm(): GoalForm {
  return { name: "", target: "", saved: "", deadline: "", icon: GOAL_ICONS[0], color: GOAL_COLORS[0] };
}

export function goalToForm(goal: GoalData): GoalForm {
  const toInput = (value: number) => value.toFixed(2).replace(".", ",");
  return {
    name: goal.name,
    target: toInput(goal.targetValue),
    saved: goal.savedValue > 0 ? toInput(goal.savedValue) : "",
    deadline: goal.deadline ? goal.deadline.slice(0, 10) : "",
    icon: goal.icon,
    color: goal.color,
  };
}

/** Valida o formulário e monta o payload da API. */
export function parseGoalForm(
  form: GoalForm,
  today: Date = new Date()
): { ok: true; data: GoalInput } | { ok: false; errors: GoalFormErrors } {
  const errors: GoalFormErrors = {};

  const name = form.name.trim();
  if (!name) errors.name = "Dê um nome para a meta";
  else if (name.length > 100) errors.name = "Use até 100 caracteres";

  const target = parseCurrencyInput(form.target);
  if (!(target > 0)) errors.target = "Informe um valor maior que zero";
  else if (target > MAX_VALUE) errors.target = "Valor muito alto";

  const saved = form.saved.trim() ? parseCurrencyInput(form.saved) : 0;
  if (saved < 0) errors.saved = "O valor não pode ser negativo";
  else if (saved > MAX_VALUE) errors.saved = "Valor muito alto";

  let deadline: string | null = null;
  if (form.deadline) {
    const date = new Date(`${form.deadline}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.deadline) || Number.isNaN(date.getTime())) {
      errors.deadline = "Data inválida";
    } else if (date.getTime() < startOfDay(today).getTime()) {
      errors.deadline = "O prazo precisa ser hoje ou depois";
    } else {
      deadline = date.toISOString();
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      targetValue: Math.round(target * 100) / 100,
      savedValue: Math.round(saved * 100) / 100,
      deadline,
      icon: form.icon,
      color: form.color,
    },
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isGoalDone(goal: GoalData): boolean {
  return goal.savedValue >= goal.targetValue;
}

/** Linha de orientação sob a barra de progresso. */
export function describeGoalProgress(goal: GoalData, now: Date = new Date()): string {
  if (isGoalDone(goal)) return "Meta concluída!";

  if (goal.deadline) {
    const deadline = new Date(goal.deadline);
    const days = Math.ceil((startOfDay(deadline).getTime() - startOfDay(now).getTime()) / DAY_MS);
    const dateText = deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    if (days < 0) return `Prazo encerrado em ${dateText}`;
    if (days === 0) return `O prazo é hoje · faltam ${formatCurrency(goal.remaining)}`;
    const months = Math.max(1, Math.ceil(days / 30));
    const perMonth = goal.remaining / months;
    return months === 1
      ? `Prazo ${dateText} · guarde ${formatCurrency(goal.remaining)} até lá`
      : `Prazo ${dateText} · guarde ${formatCurrency(perMonth)}/mês`;
  }

  if (goal.estimatedMonths !== null) {
    return goal.estimatedMonths === 1
      ? "No ritmo atual, cerca de 1 mês"
      : `No ritmo atual, cerca de ${goal.estimatedMonths} meses`;
  }
  return "Faça o primeiro depósito para começar";
}

/** Em andamento primeiro (prazo mais próximo antes, sem prazo depois), concluídas no fim. */
export function sortGoals(goals: GoalData[]): GoalData[] {
  const deadlineTime = (g: GoalData) => (g.deadline ? new Date(g.deadline).getTime() : Number.POSITIVE_INFINITY);
  return [...goals].sort((a, b) => {
    const doneDiff = Number(isGoalDone(a)) - Number(isGoalDone(b));
    if (doneDiff !== 0) return doneDiff;
    return deadlineTime(a) - deadlineTime(b);
  });
}

export function summarizeGoals(goals: GoalData[]) {
  const saved = goals.reduce((sum, g) => sum + g.savedValue, 0);
  const target = goals.reduce((sum, g) => sum + g.targetValue, 0);
  return {
    count: goals.length,
    done: goals.filter(isGoalDone).length,
    saved,
    target,
    percent: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
  };
}

/** Chave de idempotência de uma ação do usuário (reutilizada nas novas tentativas). */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
