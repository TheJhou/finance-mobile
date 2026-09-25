/** Notificação capturada pelo lado nativo, aguardando o JS gravá-la e confirmar. */
export interface InboxItem {
  /** Id na fila de entrada nativa; usado no ackInbox */
  id: number;
  /** Hash do conteúdo, estável entre reapresentações da mesma notificação */
  contentHash: string;
  packageName: string;
  title: string;
  text: string;
  bigText: string | null;
  subText: string | null;
  /** Linhas de estilos em lista/conversa (bancos que agrupam lançamentos) */
  textLines: string[];
  postTime: number;
  /** Tentativas anteriores do JS de gravar o item que falharam */
  attempts: number;
}

export interface ListenerStatus {
  connected: boolean;
  lastConnectedAt: number;
  lastDisconnectedAt: number;
  lastNotificationAt: number;
}

export type BankNotificationsModuleEvents = {
  /** Há itens novos na fila de entrada; o JS deve chamar getInbox */
  onInboxChanged: () => void;
  onConnectionChange: (event: { connected: boolean }) => void;
};
