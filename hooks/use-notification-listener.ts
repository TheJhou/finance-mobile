import { enrichPendingNotifications } from "@/lib/notification-ai";
import { cleanupNotificationLog, drainInbox } from "@/lib/notification-inbox";
import { cleanupOldQueueItems } from "@/lib/notification-queue";
import { processSyncQueue } from "@/lib/sync-queue";
import BankNotifications from "@/modules/bank-notifications";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";

const AI_RETRY_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MS = 120_000;
/** Intervalo mínimo entre pedidos leves de reconexão ao voltar para o app */
const REBIND_MIN_INTERVAL_MS = 60_000;

/**
 * Liga a captura de notificações bancárias ao banco do app.
 *
 * A captura em si é nativa: o serviço grava cada notificação numa fila de
 * entrada durável, mesmo com o JS pausado ou o app fechado. Aqui só esvaziamos
 * essa fila (drainInbox) quando o nativo avisa, ao abrir o app e ao voltar para
 * ele; a IA roda depois, separada, e nunca atrasa a gravação.
 */
export function useNotificationListener() {
  useEffect(() => {
    if (!BankNotifications) {
      console.log("[AutoImport] Módulo BankNotifications não disponível");
      return;
    }
    const native = BankNotifications;

    let isOnline = true;
    let syncRunning = false;
    let lastRebindAt = 0;

    function enrich(): void {
      if (!isOnline) return;
      enrichPendingNotifications().catch((error) =>
        console.warn("[AutoImport] Falha no enriquecimento com IA:", error instanceof Error ? error.message : error)
      );
    }

    function drain(): void {
      drainInbox()
        .then((summary) => {
          if (summary.processed > 0) {
            console.log(
              `[AutoImport] Fila de entrada: ${summary.processed} gravadas, ${summary.queued} para aprovação, ${summary.failed} falhas`
            );
          }
          if (summary.queued > 0) enrich();
        })
        .catch((error) =>
          console.warn("[AutoImport] Falha ao ler a fila de entrada:", error instanceof Error ? error.message : error)
        );
    }

    function sync(): void {
      if (!isOnline || syncRunning) return;
      syncRunning = true;
      processSyncQueue()
        .catch((error) => console.warn("[AutoImport] Falha no sync:", error instanceof Error ? error.message : error))
        .finally(() => {
          syncRunning = false;
        });
    }

    /** Pedido leve de reconexão: não derruba o serviço, só pede ao sistema para religar. */
    function ensureConnected(): void {
      try {
        if (!native.isPermissionGranted() || native.isListenerConnected()) return;
        const now = Date.now();
        if (now - lastRebindAt < REBIND_MIN_INTERVAL_MS) return;
        lastRebindAt = now;
        console.warn("[AutoImport] Listener desconectado — pedindo reconexão ao sistema");
        native.requestRebind();
      } catch (error) {
        console.warn("[AutoImport] Falha ao verificar o listener:", error);
      }
    }

    const inboxSub = native.addListener("onInboxChanged", drain);

    const connSub = native.addListener("onConnectionChange", (event: { connected: boolean }) => {
      // A reconexão é feita pelo serviço nativo; aqui só registramos
      console.log(`[AutoImport] Listener ${event.connected ? "conectado" : "desconectado"}`);
      if (event.connected) drain();
    });

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      drain();
      ensureConnected();
      enrich();
      sync();
    });

    const netInfoSub = NetInfo.addEventListener((state) => {
      const wasOnline = isOnline;
      isOnline = state.isConnected === true && state.isInternetReachable !== false;
      if (isOnline && !wasOnline) {
        enrich();
        sync();
      }
    });

    // Timers só disparam com o app em primeiro plano; a captura não depende deles
    const aiRetryInterval = setInterval(enrich, AI_RETRY_INTERVAL_MS);
    const syncInterval = setInterval(sync, SYNC_INTERVAL_MS);

    NetInfo.fetch().then((state) => {
      isOnline = state.isConnected === true && state.isInternetReachable !== false;
      enrich();
      sync();
    });
    drain();
    ensureConnected();
    cleanupOldQueueItems().catch(() => {});
    cleanupNotificationLog().catch(() => {});

    return () => {
      inboxSub.remove();
      connSub.remove();
      appStateSub.remove();
      netInfoSub();
      clearInterval(aiRetryInterval);
      clearInterval(syncInterval);
    };
  }, []);
}
