import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Módulo de criptografia para dados sensíveis
 * Usa expo-crypto (SHA-256, random bytes) + XOR com chave derivada.
 * Para proteção robusta em produção, avalie expo-standard-web-crypto ou
 * react-native-aes-crypto quando o Google Play Billing estiver ativo.
 */

const ENCRYPTION_KEY = 'finance_app_encryption_key';

// Deriva uma chave de 32 bytes a partir de uma seed via SHA-256
async function deriveKey(seed: string): Promise<Uint8Array> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Gera ou recupera a chave de criptografia do SecureStore
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  try {
    const existingKey = await SecureStore.getItemAsync(ENCRYPTION_KEY);
    if (existingKey) {
      return deriveKey(existingKey);
    }

    const seed = `${Date.now()}-${Math.random()}-${Platform.OS}`;
    const keyHex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
    await SecureStore.setItemAsync(ENCRYPTION_KEY, keyHex);
    return deriveKey(keyHex);
  } catch (error) {
    console.error('[Crypto] Failed to get encryption key:', error);
    throw new Error('Encryption system unavailable');
  }
}

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  const bin = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  return btoa(bin);
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Criptografa dados (XOR + chave derivada de SHA-256 + base64)
 */
export async function encrypt(data: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const iv = await Crypto.getRandomBytesAsync(12);
    const dataBytes = new TextEncoder().encode(data);
    const combined = new Uint8Array(iv.length + dataBytes.length);
    combined.set(iv);
    combined.set(dataBytes, iv.length);
    const encrypted = xorBytes(combined, key);
    return bytesToBase64(encrypted);
  } catch (error) {
    console.error('[Crypto] Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Descriptografa dados
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encrypted = base64ToBytes(encryptedData);
    const decrypted = xorBytes(encrypted, key);
    // IV é os primeiros 12 bytes
    const dataBytes = decrypted.slice(12);
    return new TextDecoder().decode(dataBytes);
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Gera hash de dados para verificação de integridade
 */
export async function hashData(data: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data
    );
  } catch (error) {
    console.error('[Crypto] Hash generation failed:', error);
    throw new Error('Failed to generate hash');
  }
}

/**
 * Verifica integridade dos dados
 */
export async function verifyIntegrity(data: string, expectedHash: string): Promise<boolean> {
  try {
    const actualHash = await hashData(data);
    return actualHash === expectedHash;
  } catch (error) {
    console.error('[Crypto] Integrity verification failed:', error);
    return false;
  }
}

/**
 * Gera salt para derivação de chaves
 */
export async function generateSalt(): Promise<string> {
  try {
    const salt = await Crypto.getRandomBytesAsync(16);
    return bytesToBase64(salt);
  } catch (error) {
    console.error('[Crypto] Salt generation failed:', error);
    throw new Error('Failed to generate salt');
  }
}

/**
 * Limpa todos os dados criptográficos armazenados
 */
export async function clearCryptoData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ENCRYPTION_KEY);
    console.log('[Crypto] Encryption key cleared');
  } catch (error) {
    console.error('[Crypto] Failed to clear crypto data:', error);
  }
}

/**
 * Verifica se o sistema de criptografia está disponível
 */
export async function isCryptoAvailable(): Promise<boolean> {
  try {
    await getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Classe para gerenciar criptografia de backups
 */
export class BackupCrypto {
  private static readonly BACKUP_VERSION = '1.0';
  private static readonly HEADER_PREFIX = 'FINCRYPT_';

  /**
   * Prepara dados para backup com metadados
   */
  static async prepareBackup(data: any): Promise<string> {
    const backupData = {
      version: this.BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      data: data
    };

    const jsonData = JSON.stringify(backupData);
    const encrypted = await encrypt(jsonData);
    const hash = await hashData(jsonData);

    return `${this.HEADER_PREFIX}${hash}_${encrypted}`;
  }

  /**
   * Processa backup criptografado
   */
  static async processBackup(backupString: string): Promise<any> {
    if (!backupString.startsWith(this.HEADER_PREFIX)) {
      throw new Error('Invalid backup format');
    }

    const [, hashAndData] = backupString.split(this.HEADER_PREFIX);
    const [expectedHash, encryptedData] = hashAndData.split('_');

    if (!expectedHash || !encryptedData) {
      throw new Error('Corrupted backup format');
    }

    const decryptedData = await decrypt(encryptedData);

    if (!await verifyIntegrity(decryptedData, expectedHash)) {
      throw new Error('Backup integrity check failed');
    }

    const backup = JSON.parse(decryptedData);

    if (backup.version !== this.BACKUP_VERSION) {
      console.warn(`[BackupCrypto] Version mismatch: expected ${this.BACKUP_VERSION}, got ${backup.version}`);
    }

    return backup.data;
  }

  /**
   * Verifica se um backup é válido
   */
  static async validateBackup(backupString: string): Promise<boolean> {
    try {
      await this.processBackup(backupString);
      return true;
    } catch {
      return false;
    }
  }
}

export default {
  encrypt,
  decrypt,
  hashData,
  verifyIntegrity,
  generateSalt,
  clearCryptoData,
  isCryptoAvailable,
  BackupCrypto
};
