import { NativeModule, requireNativeModule } from "expo";
import type { BankNotificationsModuleEvents } from "./BankNotifications.types";

declare class BankNotificationsModule extends NativeModule<BankNotificationsModuleEvents> {
  isPermissionGranted(): boolean;
  isListenerConnected(): boolean;
  requestRebind(): void;
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
