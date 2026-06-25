// Mock expo-secure-store for unit testing
// Provides in-memory key-value storage

const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

export function getItemSync(key: string): string | null {
  return store.get(key) ?? null;
}

export function setItemSync(key: string, value: string): void {
  store.set(key, value);
}

export function deleteItemSync(key: string): void {
  store.delete(key);
}

export function canUseBiometricAuthentication(): boolean {
  return false;
}

export function resetSecureStoreMock(): void {
  store.clear();
}
