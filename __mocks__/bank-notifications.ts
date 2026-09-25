// Mock do módulo nativo BankNotifications: fila de entrada em memória, com a
// mesma semântica do lado Kotlin (itens só saem da fila com ackInbox).
import type { InboxItem } from "@/modules/bank-notifications/src/BankNotifications.types";

type Listener = (...args: unknown[]) => void;

let inbox: InboxItem[] = [];
let nextId = 1;
let listeners = new Map<string, Set<Listener>>();
let failGetInbox = false;

export const mockBankNotifications = {
  isPermissionGranted: jest.fn(() => true),
  isListenerConnected: jest.fn(() => true),
  getListenerStatus: jest.fn(() => ({ connected: true, lastConnectedAt: 0, lastDisconnectedAt: 0, lastNotificationAt: 0 })),
  getMonitoredPackages: jest.fn(() => [] as string[]),
  requestRebind: jest.fn(() => true),
  repairConnection: jest.fn(() => true),
  getInbox: jest.fn(async (limit: number) => {
    if (failGetInbox) throw new Error("getInbox indisponível");
    // Mesma ordem do Kotlin: os que já falharam vão para o fim
    return [...inbox]
      .sort((a, b) => a.attempts - b.attempts || a.id - b.id)
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }),
  ackInbox: jest.fn(async (ids: number[]) => {
    const acked = new Set(ids);
    inbox = inbox.filter((item) => !acked.has(item.id));
  }),
  failInbox: jest.fn(async (ids: number[]) => {
    const failed = new Set(ids);
    for (const item of inbox) if (failed.has(item.id)) item.attempts++;
  }),
  clearInbox: jest.fn(async () => {
    inbox = [];
  }),
  openPermissionSettings: jest.fn(),
  isBatteryOptimizationIgnored: jest.fn(() => true),
  requestIgnoreBatteryOptimizations: jest.fn(() => true),
  addListener: jest.fn((event: string, listener: Listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(listener);
    return { remove: () => listeners.get(event)?.delete(listener) };
  }),
};

/** Simula o serviço nativo capturando uma notificação. */
export function pushInboxItem(item: Partial<InboxItem> & Pick<InboxItem, "packageName" | "title" | "text">): InboxItem {
  const id = nextId++;
  const full: InboxItem = {
    id,
    contentHash: `hash-${id}`,
    bigText: null,
    subText: null,
    textLines: [],
    postTime: 1_719_064_800_000 + id,
    attempts: 0,
    ...item,
  };
  inbox.push(full);
  return full;
}

export function getMockInbox(): InboxItem[] {
  return inbox;
}

export function setFailGetInbox(value: boolean): void {
  failGetInbox = value;
}

export function emitNativeEvent(event: string, ...args: unknown[]): void {
  listeners.get(event)?.forEach((listener) => listener(...args));
}

export function resetBankNotificationsMock(): void {
  inbox = [];
  nextId = 1;
  listeners = new Map();
  failGetInbox = false;
  Object.values(mockBankNotifications).forEach((fn) => fn.mockClear());
}

export default mockBankNotifications;
