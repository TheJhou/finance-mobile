import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Módulo de criptografia para dados sensíveis
 * Conforme requisitos do Google Play Store para apps financeiros
 */

const ENCRYPTION_KEY = 'finance_app_encryption_key';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * Gera ou recupera a chave de criptografia do SecureStore
 */
async function getEncryptionKey(): Promise<Crypto.CryptoDigestAlgorithm> {
  try {
    const existingKey = await SecureStore.getItemAsync(ENCRYPTION_KEY);
    if (existingKey) {
      return existingKey as Crypto.CryptoDigestAlgorithm;
    }

    // Gerar nova chave
    const key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Date.now()}-${Math.random()}-${Device.osName}`
    );

    await SecureStore.setItemAsync(ENCRYPTION_KEY, key);
    return key as Crypto.CryptoDigestAlgorithm;
  } catch (error) {
    console.error('[Crypto] Failed to get encryption key:', error);
    throw new Error('Encryption system unavailable');
  }
}

/**
 * Criptografa dados usando AES-GCM
 */
export async function encrypt(data: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const iv = await Crypto.getRandomBytesAsync(12); // 96-bit IV for GCM
    
    const encryptedData = await Crypto.encryptAsync(
      data,
      key,
      { iv, algorithm: ALGORITHM }
    );

    // Combinar IV + dados criptografados para armazenamento
    const combined = new Uint8Array(iv.length + encryptedData.length);
    combined.set(iv);
    combined.set(encryptedData, iv.length);

    // Converter para base64 para armazenamento seguro
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('[Crypto] Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Descriptografa dados usando AES-GCM
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    
    // Converter de base64 para bytes
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );

    // Extrair IV e dados
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decryptedData = await Crypto.decryptAsync(
      data,
      key,
      { iv, algorithm: ALGORITHM }
    );

    return decryptedData;
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
    return btoa(String.fromCharCode(...salt));
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
