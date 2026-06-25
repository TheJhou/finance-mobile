// Mock expo-crypto for unit testing

export const CryptoDigestAlgorithm = {
  SHA256: "SHA-256",
  SHA512: "SHA-512",
} as const;

export const CryptoEncoding = {
  HEX: "hex",
  BASE64: "base64",
} as const;

export async function digestStringAsync(
  algorithm: string,
  data: string,
  _options?: { encoding?: string }
): Promise<string> {
  // Simple hash mock — not cryptographically secure, just for testing
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Return a 64-char hex string to mimic SHA-256 output
  const base = (hash >>> 0).toString(16).padStart(8, "0");
  return (base.repeat(8)).slice(0, 64);
}

export async function getRandomBytesAsync(count: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export async function getRandomValuesAsync<T extends ArrayBufferView>(
  array: T
): Promise<T> {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < view.length; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

export function getRandomValuesSync<T extends ArrayBufferView>(array: T): T {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < view.length; i++) {
    view[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

export const Crypto = {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytesAsync,
  getRandomValuesAsync,
  getRandomValuesSync,
};
