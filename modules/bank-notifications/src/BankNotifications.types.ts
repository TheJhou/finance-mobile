export interface BankNotificationEvent {
  packageName: string;
  title: string;
  text: string;
  bigText: string | null;
  subText: string | null;
  postTime: number;
}

export type BankNotificationsModuleEvents = {
  onNotification: (event: BankNotificationEvent) => void;
};
