import { NativeModule, requireNativeModule } from "expo";
import type { BankNotificationsModuleEvents } from "./BankNotifications.types";

declare class BankNotificationsModule extends NativeModule<BankNotificationsModuleEvents> {
  isPermissionGranted(): boolean;
  openPermissionSettings(): void;
}

export default requireNativeModule<BankNotificationsModule>("BankNotifications");
