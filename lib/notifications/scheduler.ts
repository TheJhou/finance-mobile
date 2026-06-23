import { getGoals } from "@/lib/backend";
import { getUpcomingBills } from "@/lib/repositories/dashboard";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Chaves para controle de cooldown
const COMMITMENT_ALERT_COOLDOWN_KEY = 'commitment_alert_cooldown';
const COOLDOWN_HOURS = 24; // 24 horas entre alertas

// Configurar notificações
export async function configureNotifications(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("finance-alerts", {
      name: "Alertas Financeiros",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
  }

  await Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Solicitar permissão de notificação
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

// Agendar notificação para conta vencendo
export async function scheduleBillReminder(
  billId: string,
  billName: string,
  amount: number,
  dueDate: string
): Promise<string> {
  const scheduledDate = new Date(dueDate + "T09:00:00");
  const today = new Date();
  
  // Se a data já passou, não agendar
  if (scheduledDate < today) {
    return "";
  }

  const trigger = scheduledDate.getTime() - Date.now();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Conta para pagar",
      body: `${billName} - R$ ${amount.toFixed(2)} vence hoje!`,
      data: { type: "bill", billId },
    },
    trigger: { seconds: Math.floor(trigger / 1000) },
  });

  return identifier;
}

// Agendar notificação para meta
export async function scheduleGoalReminder(
  goalId: string,
  goalName: string,
  progress: number
): Promise<string> {
  const trigger = { seconds: 86400 }; // 24 horas

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Lembrete de meta",
      body: `Sua meta "${goalName}" está ${progress.toFixed(0)}% completa. Continue assim!`,
      data: { type: "goal", goalId },
    },
    trigger,
  });

  return identifier;
}

// Agendar alerta de alto comprometimento
export async function scheduleHighCommitmentAlert(
  commitmentPercent: number
): Promise<string> {
  const trigger = { seconds: 3600 }; // 1 hora

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Alerta de comprometimento",
      body: `Seu comprometimento da renda está em ${commitmentPercent}%. Tente reduzir gastos!`,
      data: { type: "commitment" },
    },
    trigger,
  });

  return identifier;
}

// Cancelar todas as notificações agendadas
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Cancelar notificação específica
export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Agendar alertas para contas próximas
export async function scheduleUpcomingBillsAlerts(): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const bills = await getUpcomingBills();
  
  for (const bill of bills) {
    const daysUntilDue = Math.floor(
      (new Date(bill.date + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Agendar alerta 1 dia antes
    if (daysUntilDue === 1) {
      await scheduleBillReminder(bill.id, bill.name, bill.amount, bill.date);
    }
  }
}

// Agendar alertas para metas
export async function scheduleGoalAlerts(): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const goals = await getGoals();
  
  for (const goal of goals) {
    // Alertar se progresso > 50% e < 75%
    if (goal.progress > 50 && goal.progress < 75) {
      await scheduleGoalReminder(goal.id, goal.name, goal.progress);
    }
  }
}

// Verificar se pode enviar alerta (cooldown)
async function canSendCommitmentAlert(): Promise<boolean> {
  try {
    const lastAlert = await AsyncStorage.getItem(COMMITMENT_ALERT_COOLDOWN_KEY);
    if (!lastAlert) return true;

    const lastAlertTime = parseInt(lastAlert);
    const now = Date.now();
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;

    return (now - lastAlertTime) > cooldownMs;
  } catch {
    return true;
  }
}

// Marcar que alerta foi enviado
async function markCommitmentAlertSent(): Promise<void> {
  try {
    await AsyncStorage.setItem(COMMITMENT_ALERT_COOLDOWN_KEY, Date.now().toString());
  } catch {
    // Ignorar erro
  }
}

// Agendar alerta de comprometimento com cooldown inteligente
export async function scheduleDailyCommitmentCheck(commitmentPercent: number): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Apenas alertar se comprometimento for realmente alto (>80%)
  if (commitmentPercent > 80) {
    const canSend = await canSendCommitmentAlert();
    if (canSend) {
      await scheduleHighCommitmentAlert(commitmentPercent);
      await markCommitmentAlertSent();
      console.log(`[Notifications] Alerta enviado: ${commitmentPercent}%`);
    } else {
      console.log(`[Notifications] Alerta em cooldown: ${commitmentPercent}%`);
    }
  }
}
