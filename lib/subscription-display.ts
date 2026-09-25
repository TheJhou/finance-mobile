import type { SubscriptionStatus } from "@/lib/types";

export type HeadlineTone = "success" | "warning" | "danger" | "muted";

export interface SubscriptionHeadline {
  isPro: boolean;
  /** Texto do selo: ATIVA, CANCELADA... */
  badge: string;
  tone: HeadlineTone;
  title: string;
  /** Renovação, fim do acesso ou orientação; null quando não há o que dizer */
  detail: string | null;
}

const FREE_BACKUP_LIMIT = 3;

export function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Resumo da assinatura para o cartão do topo da tela. */
export function describeSubscription(status: SubscriptionStatus): SubscriptionHeadline {
  if (status.offline) {
    return {
      isPro: false,
      badge: "OFFLINE",
      tone: "muted",
      title: "Assinatura indisponível",
      detail: "Conecte-se à internet para ver seu plano.",
    };
  }

  if (status.plan.code !== "PRO") {
    return { isPro: false, badge: "GRÁTIS", tone: "muted", title: "Plano Gratuito", detail: null };
  }

  const details = status.subscription;
  const endDate = formatLongDate(details?.currentPeriodEnd);
  switch (details?.state) {
    case "CANCELED_PENDING_END":
      return {
        isPro: true,
        badge: "CANCELADA",
        tone: "warning",
        title: "Kilun Pro",
        detail: endDate ? `Pro até ${endDate}. Depois volta ao plano gratuito.` : "Não será renovada.",
      };
    case "GRACE":
      return {
        isPro: true,
        badge: "PAGAMENTO PENDENTE",
        tone: "danger",
        title: "Kilun Pro",
        detail: "O pagamento da renovação falhou. Atualize a forma de pagamento na Google Play para não perder o Pro.",
      };
    default:
      return {
        isPro: true,
        badge: "ATIVA",
        tone: "success",
        title: "Kilun Pro",
        detail: endDate ? `Renova em ${endDate}` : null,
      };
  }
}

export function getUsagePercent(status: SubscriptionStatus): number {
  if (!status.usage.limit) return 0;
  return Math.min(100, Math.round((status.usage.used / status.usage.limit) * 100));
}

/** Mensagem do diálogo antes de levar o usuário para cancelar na Google Play. */
export function getCancelDialogMessage(status: SubscriptionStatus): string {
  const endDate = formatLongDate(status.subscription?.currentPeriodEnd);
  const parts = [
    "O cancelamento é feito na Google Play. Vamos abrir a sua assinatura lá.",
    endDate
      ? `Você continua com o Pro até ${endDate}. Depois disso, volta ao plano gratuito.`
      : "Você continua com o Pro até o fim do período já pago. Depois disso, volta ao plano gratuito.",
    "No plano gratuito: OCR, áudio, previsão com IA e exportação em Excel/PDF deixam de funcionar, e o limite de uso da IA diminui.",
  ];
  const backupsUsed = status.backups?.used ?? 0;
  if (backupsUsed > FREE_BACKUP_LIMIT) {
    parts.push(
      `Você tem ${backupsUsed} backups na nuvem; o plano gratuito guarda ${FREE_BACKUP_LIMIT}. Para fazer backups novos, será preciso apagar os mais antigos.`
    );
  }
  return parts.join("\n\n");
}
