import { NativeModule, requireNativeModule } from "expo";
import type { BankNotificationsModuleEvents, InboxItem, ListenerStatus } from "./BankNotifications.types";

declare class BankNotificationsModule extends NativeModule<BankNotificationsModuleEvents> {
  isPermissionGranted(): boolean;
  isListenerConnected(): boolean;
  getListenerStatus(): ListenerStatus;
  getMonitoredPackages(): string[];
  /** Pedido leve de reconexão ao sistema */
  requestRebind(): boolean;
  /** Reparo forçado (desliga e religa o serviço). Só por ação do usuário. */
  repairConnection(): boolean;
  getInbox(limit: number): Promise<InboxItem[]>;
  ackInbox(ids: number[]): Promise<void>;
  /** Conta uma tentativa malsucedida de gravar os itens (vão para o fim da fila) */
  failInbox(ids: number[]): Promise<void>;
  clearInbox(): Promise<void>;
  openPermissionSettings(): void;
  isBatteryOptimizationIgnored(): boolean;
  requestIgnoreBatteryOptimizations(): boolean;
}

let mod: BankNotificationsModule | null = null;
try {
  mod = requireNativeModule<BankNotificationsModule>("BankNotifications");
} catch {
  // Native module unavailable (Expo Go)
}

export default mod;
