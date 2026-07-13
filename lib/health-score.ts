import type { DashboardData } from "@/lib/types";

export interface HealthScoreGoal {
  name: string;
  targetValue: number;
  savedValue: number;
  progress: number;
  remaining: number;
  deadline: string | null;
}

export interface HealthScoreStreak {
  streak: number;
  todayRegistered: boolean;
  totalDays: number;
}

export interface HealthScoreBill {
  name: string;
  amount: number;
  date: string;
}

export interface HealthScorePillar {
  key: "organization" | "stability" | "control" | "planning" | "reserve";
  label: string;
  score: number;
  maxScore: number;
  weight: number;
  color: string;
  status: string;
  description: string;
  suggestion: string;
}

export interface HealthScoreTrend {
  direction: "up" | "down" | "stable";
  percentage: number | null;
  description: string;
}

export interface HealthScoreResult {
  overall: number;
  label: string;
  summary: string;
  suggestion: string;
  color: string;
  pillars: HealthScorePillar[];
  trend: HealthScoreTrend;
  risks: string[];
  highlights: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightedAverage(pillars: HealthScorePillar[]): number {
  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = pillars.reduce((sum, p) => sum + p.score * p.weight, 0);
  return Math.round(weighted / totalWeight);
}

function getPillarColor(score: number): string {
  return score >= 70 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
}

function getPillarStatus(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  return "Atenção";
}

function calculateMonthlyAverageExpense(trend: DashboardData["monthlyTrend"], currentMonth: string): number {
  const relevant = trend.filter((m) => m.month <= currentMonth && m.month >= currentMonth.slice(0, 4) + "-01");
  if (relevant.length === 0) return 0;
  return relevant.reduce((sum, m) => sum + m.expense, 0) / relevant.length;
}

function calculateExpenseVolatility(trend: DashboardData["monthlyTrend"]): number {
  const expenses = trend.map((m) => m.expense).filter((v) => v > 0);
  if (expenses.length < 2) return 0;
  const avg = expenses.reduce((a, b) => a + b, 0) / expenses.length;
  const variance = expenses.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / expenses.length;
  const stdDev = Math.sqrt(variance);
  return avg > 0 ? stdDev / avg : 0;
}

export function calculateHealthScore(
  data: DashboardData,
  streak: HealthScoreStreak | null,
  goals: HealthScoreGoal[] = [],
  bills: HealthScoreBill[] = [],
  currentMonth: string = new Date().toISOString().slice(0, 7)
): HealthScoreResult {
  const income = data.monthlyIncome;
  const expense = data.monthlyExpense;
  const savings = income - expense;
  const savingsRate = income > 0 ? savings / income : 0;
  const commitment = income > 0 ? expense / income : 0;
  const overdueRatio = income > 0 ? data.overdueAmount / income : 0;
  const upcomingRatio = income > 0 ? data.upcomingAmount / income : 0;
  const avgExpense = calculateMonthlyAverageExpense(data.monthlyTrend, currentMonth);
  const reserveMonths = avgExpense > 0 ? data.balance / avgExpense : 0;
  const volatility = calculateExpenseVolatility(data.monthlyTrend);

  // 1. Organização (hábito de registro)
  const totalDays = streak?.totalDays ?? 0;
  const streakDays = streak?.streak ?? 0;
  const todayRegistered = streak?.todayRegistered ?? false;
  const organizationScore = Math.min(
    100,
    Math.round(
      Math.min(60, streakDays * 4) + // streak recente (até 60)
      Math.min(30, totalDays * 1.5) + // consistência histórica
      (todayRegistered ? 10 : 0)
    )
  );
  const organizationPillar: HealthScorePillar = {
    key: "organization",
    label: "Organização",
    score: organizationScore,
    maxScore: 100,
    weight: 20,
    color: getPillarColor(organizationScore),
    status: getPillarStatus(organizationScore),
    description: `Você registrou em ${totalDays} dias e tem ${streakDays} dias consecutivos.`,
    suggestion: todayRegistered
      ? "Ótimo! Mantenha o registro diário para acompanhar o progresso."
      : "Registre uma transação hoje para não quebrar o streak.",
  };

  // 2. Estabilidade (capacidade de poupança e comprometimento)
  const stabilityScore = Math.min(
    100,
    Math.round(
      clamp(savingsRate * 100, 0, 60) + // até 60 pts por taxa de poupança
      (savingsRate >= 0.2 ? 20 : savingsRate >= 0.1 ? 10 : 0) + // bônus por poupar bem
      (commitment <= 0.6 ? 20 : commitment <= 0.8 ? 10 : 0)
    )
  );
  const stabilityPillar: HealthScorePillar = {
    key: "stability",
    label: "Estabilidade",
    score: stabilityScore,
    maxScore: 100,
    weight: 25,
    color: getPillarColor(stabilityScore),
    status: getPillarStatus(stabilityScore),
    description: savingsRate >= 0
      ? `Você economizou ${(savingsRate * 100).toFixed(0)}% da renda este mês.`
      : "Sua despesa ultrapassou a receita este mês.",
    suggestion: savingsRate < 0.1
      ? "Tente reservar pelo menos 10% da renda para criar reserva."
      : savingsRate >= 0.2
      ? "Excelente poupança! Considere investir o excedente."
      : "Continue assim e aumente gradualmente a reserva.",
  };

  // 3. Controle (pendências, atrasos e volatilidade)
  const controlScore = Math.min(
    100,
    Math.round(
      (data.overdueAmount === 0 ? 40 : clamp(40 - overdueRatio * 100, 0, 40)) +
      (data.pendingCount <= 3 ? 25 : data.pendingCount <= 8 ? 15 : 5) +
      (volatility <= 0.2 ? 20 : volatility <= 0.4 ? 12 : 4) +
      (upcomingRatio <= 0.3 ? 15 : upcomingRatio <= 0.6 ? 8 : 0)
    )
  );
  const controlPillar: HealthScorePillar = {
    key: "control",
    label: "Controle",
    score: controlScore,
    maxScore: 100,
    weight: 25,
    color: getPillarColor(controlScore),
    status: getPillarStatus(controlScore),
    description: data.overdueAmount > 0
      ? `Você tem ${formatCurrency(data.overdueAmount)} em contas atrasadas.`
      : `Você tem ${data.pendingCount} transação(ões) pendente(s).`,
    suggestion: data.overdueAmount > 0
      ? "Priorize o pagamento das contas atrasadas para evitar juros."
      : data.pendingCount > 5
      ? "Muitas contas pendentes. Agende os pagamentos para não perder o prazo."
      : "Você está no controle das contas.",
  };

  // 4. Planejamento (metas e recorrências)
  const goalProgress = goals.length > 0
    ? goals.reduce((sum, g) => sum + (g.targetValue > 0 ? g.savedValue / g.targetValue : 0), 0) / goals.length
    : 0;
  const planningScore = Math.min(
    100,
    Math.round(
      Math.min(50, goalProgress * 100) + // até 50 por progresso médio das metas
      Math.min(30, goals.length * 10) + // até 30 por metas ativas
      Math.min(20, bills.length * 5) + // até 20 por contas futuras conhecidas
      (data.activeRecurring > 0 ? 10 : 0)
    )
  );
  const planningPillar: HealthScorePillar = {
    key: "planning",
    label: "Planejamento",
    score: planningScore,
    maxScore: 100,
    weight: 15,
    color: getPillarColor(planningScore),
    status: getPillarStatus(planningScore),
    description: goals.length > 0
      ? `Média de progresso das metas: ${(goalProgress * 100).toFixed(0)}%.`
      : "Você ainda não cadastrou metas financeiras.",
    suggestion: goals.length === 0
      ? "Crie uma meta de reserva para dar direção às suas finanças."
      : goalProgress < 0.3
      ? "Suas metas estão no início. Automatize um aporte mensal."
      : "Bom progresso nas metas. Revise o prazo e aporte.",
  };

  // 5. Reserva (caixa vs média de gastos)
  const reserveScore = Math.min(
    100,
    Math.round(reserveMonths * 20)
  );
  const reservePillar: HealthScorePillar = {
    key: "reserve",
    label: "Reserva",
    score: reserveScore,
    maxScore: 100,
    weight: 15,
    color: getPillarColor(reserveScore),
    status: getPillarStatus(reserveScore),
    description: avgExpense > 0
      ? `Seu caixa cobre ${reserveMonths.toFixed(1)} mês(es) de gastos médios.`
      : "Sem histórico suficiente para calcular reserva.",
    suggestion: reserveMonths < 1
      ? "Reserve emergência urgente: priorize 1 mês de gastos."
      : reserveMonths < 3
      ? "Bom começo. A meta ideal é 3 a 6 meses de gastos."
      : "Reserva confortável. Você está protegido para imprevistos.",
  };

  const pillars = [organizationPillar, stabilityPillar, controlPillar, planningPillar, reservePillar];
  const overall = weightedAverage(pillars);

  // Tendência vs mês anterior
  const currentTrend = data.monthlyTrend.find((m) => m.month === currentMonth);
  const prevMonth = new Date(currentMonth + "-01T00:00:00");
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);
  const prevTrend = data.monthlyTrend.find((m) => m.month === prevMonthStr);

  const currentNet = currentTrend ? currentTrend.income - currentTrend.expense : 0;
  const prevNet = prevTrend ? prevTrend.income - prevTrend.expense : 0;
  const trendPercentage = prevNet !== 0 ? Math.round(((currentNet - prevNet) / Math.abs(prevNet)) * 100) : null;

  const trend: HealthScoreTrend = {
    direction: trendPercentage === null ? "stable" : trendPercentage >= 5 ? "up" : trendPercentage <= -5 ? "down" : "stable",
    percentage: trendPercentage,
    description: trendPercentage === null
      ? "Sem dados do mês anterior."
      : trendPercentage >= 5
      ? `Saldo mensal melhorou ${trendPercentage}% vs o mês anterior.`
      : trendPercentage <= -5
      ? `Saldo mensal caiu ${Math.abs(trendPercentage)}% vs o mês anterior.`
      : "Saldo mensal estável vs o mês anterior.",
  };

  // Riscos e destaques
  const risks: string[] = [];
  const highlights: string[] = [];

  if (commitment > 0.8) risks.push("Comprometimento da renda acima de 80%");
  if (data.overdueAmount > 0) risks.push(`${formatCurrency(data.overdueAmount)} em contas atrasadas`);
  if (savingsRate < 0) risks.push("Gastos superaram a receita este mês");
  if (reserveMonths < 1) risks.push("Reserva emergencial insuficiente");
  if (volatility > 0.4) risks.push("Alta variação de gastos mensais");

  if (savingsRate >= 0.2) highlights.push(`Economia de ${(savingsRate * 100).toFixed(0)}% da renda`);
  if (data.overdueAmount === 0) highlights.push("Nenhuma conta atrasada");
  if (reserveMonths >= 3) highlights.push(`Reserva de ${reserveMonths.toFixed(1)} meses`);
  if (goalProgress >= 0.5) highlights.push("Metas em bom progresso");

  // Rótulo e resumo
  let label: string;
  let summary: string;
  let suggestion: string;
  let color: string;

  if (overall >= 80) {
    label = "Excelente";
    summary = "Suas finanças estão muito bem cuidadas.";
    suggestion = "Aproveite para investir o excedente e revisar metas de longo prazo.";
    color = "#34d399";
  } else if (overall >= 60) {
    label = "Boa";
    summary = "Você tem uma base sólida, mas há pontos para ajustar.";
    suggestion = "Foque no pilar com menor nota para subir de patamar.";
    color = "#34d399";
  } else if (overall >= 40) {
    label = "Regular";
    summary = "Há espaço para melhorar o controle e planejamento.";
    suggestion = "Priorize a reserva emergencial e o pagamento de atrasos.";
    color = "#fbbf24";
  } else {
    label = "Atenção";
    summary = "Sua saúde financeira precisa de cuidados imediatos.";
    suggestion = "Revise gastos, negocie dívidas e crie um plano de reserva.";
    color = "#f87171";
  }

  return {
    overall,
    label,
    summary,
    suggestion,
    color,
    pillars,
    trend,
    risks,
    highlights,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
