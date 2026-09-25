export interface User {
  id: string;
  name: string;
  email: string;
}

export type PlanCode = "FREE" | "PRO";

export interface PlanInfo {
  code: PlanCode;
  name: string;
  tokenLimit: number;
}

export interface UsageInfo {
  used: number;
  limit: number;
  remaining: number;
  period: string;
  resetsAt: string;
}

/**
 * - ACTIVE: renova automaticamente
 * - CANCELED_PENDING_END: cancelada na Google Play, PRO até o fim do período
 * - GRACE: renovação com pagamento pendente (a Google mantém o acesso por alguns dias)
 */
export type SubscriptionState = "ACTIVE" | "CANCELED_PENDING_END" | "GRACE";

export interface SubscriptionDetails {
  state: SubscriptionState;
  provider: string | null;
  currentPeriodEnd: string | null;
  autoRenewing: boolean;
}

/** O que o plano libera — mesma regra usada pelo backend para bloquear. */
export interface Entitlements {
  textAnalysis: boolean;
  ocr: boolean;
  transcribe: boolean;
  extractPhoto: boolean;
  extractText: boolean;
  aiForecast: boolean;
  premiumExport: boolean;
  cloudBackupLimit: number;
}

export interface SubscriptionStatus {
  plan: PlanInfo;
  usage: UsageInfo;
  /** Só para PRO; ausente em backends antigos */
  subscription?: SubscriptionDetails | null;
  entitlements?: Entitlements;
  backups?: { used: number; limit: number };
  upgradeUrl?: string;
  /** Sem conexão: dados padrão do plano FREE, não o plano real do usuário */
  offline?: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export type TransactionType = "INCOME" | "EXPENSE";
export type TransactionStatus = "PAID" | "PENDING" | "OVERDUE";
export type PaymentMethod =
  | "CASH"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "PIX"
  | "BANK_TRANSFER"
  | "BOLETO"
  | "MERCADO_PAGO"
  | "OTHER";
export type DocumentType = "NORMAL" | "BOLETO" | "NOTA_FISCAL" | "COMPROVANTE_PIX" | "COMPROVANTE_BANCARIO" | "OUTRO";
export type TransactionSource = "MANUAL" | "IMPORT" | "BANK_NOTIFICATION";
export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Transaction {
  id: string;
  description: string;
  amount: string | number;
  type: TransactionType;
  status: TransactionStatus;
  paymentMethod: PaymentMethod;
  date: string;
  notes?: string | null;
  categoryId: string;
  category?: Category;
  createdAt: string;
  updatedAt: string;
  // Document type and additional fields
  documentType: DocumentType;
  boletoNumber?: string | null;
  cnpj?: string | null;
  recipientName?: string | null;
  // Recurrence tracking
  recurringId?: string | null;
  // Source tracking
  source: TransactionSource;
  bankOrigin?: string | null;
}

export interface RecurringTransaction {
  id: string;
  description: string;
  amount: string | number;
  type: TransactionType;
  frequency: Frequency;
  paymentMethod: PaymentMethod;
  isActive: boolean;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  categoryId: string;
  category?: Category;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  balance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  upcomingAmount: number;
  activeRecurring: number;
  pendingReceivables: number;
  pendingPayables: number;
  prevPendingReceivables: number;
  prevPendingPayables: number;
  expensesByCategory: { name: string; value: number; color: string }[];
  expenseTrend: { label: string; value: number }[];
  monthlyTrend: { month: string; income: number; expense: number }[];
  evolution: { month: string; balance: number }[];
}

export type HealthScorePillarKey = "organization" | "stability" | "control" | "planning" | "reserve";

export interface HealthScorePillar {
  key: HealthScorePillarKey;
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
