export interface User {
  id: string;
  name: string;
  email: string;
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
  | "OTHER";
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
  upcomingAmount: number;
  activeRecurring: number;
  expensesByCategory: { name: string; value: number; color: string }[];
  monthlyTrend: { month: string; income: number; expense: number }[];
  evolution: { month: string; balance: number }[];
}
