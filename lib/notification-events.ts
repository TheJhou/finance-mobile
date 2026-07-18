/**
 * Canal leve de eventos para sinalizar que a fila de notificações mudou.
 * Permite que a aba de importação atualize em tempo real sem polling.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Registra um callback chamado sempre que um item é adicionado à fila. Retorna função de cleanup. */
export function onNotificationQueued(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Dispara todos os callbacks registrados. Chamado após enqueueNotification bem-sucedido. */
export function emitNotificationQueued(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn("[NotificationEvents] Listener threw:", e);
    }
  });
}
