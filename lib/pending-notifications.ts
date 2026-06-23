import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PaymentMethod, TransactionType } from './types';

const PENDING_KEY = 'finance_pending_notifications';

export interface PendingNotification {
  id: string;
  bank: string;
  packageName: string;
  raw: string;
  postTime: number;
  createdAt: string;
  // parsed + AI-enriched
  amount: number;
  description: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  categoryId: string;
  categoryName: string;
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingNotification[]) : [];
  } catch {
    return [];
  }
}

export async function addPendingNotification(item: PendingNotification): Promise<void> {
  const current = await getPendingNotifications();
  // Evitar duplicata pelo id
  if (current.some((p) => p.id === item.id)) return;
  // Manter no máximo 50 itens
  const updated = [item, ...current].slice(0, 50);
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(updated));
}

export async function removePendingNotification(id: string): Promise<void> {
  const current = await getPendingNotifications();
  const updated = current.filter((p) => p.id !== id);
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(updated));
}

export async function clearPendingNotifications(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
