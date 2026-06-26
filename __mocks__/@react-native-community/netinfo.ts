// Mock @react-native-community/netinfo for unit testing

type NetInfoState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
};

let currentState: NetInfoState = {
  isConnected: true,
  isInternetReachable: true,
  type: "wifi",
};

const listeners: Set<(state: NetInfoState) => void> = new Set();

export async function fetch(): Promise<NetInfoState> {
  return currentState;
}

export function addEventListener(listener: (state: NetInfoState) => void): {
  remove: () => void;
} {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

export function setMockNetInfoState(state: Partial<NetInfoState>): void {
  currentState = { ...currentState, ...state };
  listeners.forEach((l) => l(currentState));
}

export function resetNetInfoMock(): void {
  currentState = {
    isConnected: true,
    isInternetReachable: true,
    type: "wifi",
  };
  listeners.clear();
}
