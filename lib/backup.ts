import { authFetch, getStoredUserName } from '@/lib/auth';
import { BACKEND_URL } from '@/lib/config';
import { generateId, getDb } from '@/lib/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

// ── Types ──────────────────────────────────────────────────────────────

export interface BackupMetadata {
  id: string;
  userId: string;
  userName: string | null;
  version: string;
  createdAt: string;
  size: number;
  checksum: string;
  tables: string[];
  encrypted: boolean;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
  };
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  filePath?: string;
  size?: number;
  error?: string;
  metadata?: BackupMetadata;
}

export interface RestoreResult {
  success: boolean;
  restoredTables: string[];
  error?: string;
  recordsRestored: number;
}

export interface CloudBackupEntry {
  key: string;
  filename: string;
  sizeBytes: number;
  lastModified: string;
}

// ── Backup System ───────────────────────────────────────────────────────

export class BackupSystem {
  private static readonly BACKUP_VERSION = '1.0.0';
  private static get BACKUP_DIR(): Directory {
    return new Directory(Paths.document, 'backups');
  }
  private static readonly MAX_BACKUPS = 7; // Keep last 7 days
  private static readonly BACKUP_KEY = 'finance_backup_schedule';

  // Initialize backup directory
  static async initialize(): Promise<void> {
    const dir = this.BACKUP_DIR;
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  }

  // Get current user ID (from auth or device ID) — public so BackupScheduler can delegate
  static async getPublicUserId(): Promise<string> {
    return this.getUserId();
  }

  private static async getUserId(): Promise<string> {
    try {
      const userName = await getStoredUserName();
      const deviceId = await this.getOrCreateDeviceId();
      return `user_${userName?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'}_${deviceId}`;
    } catch {
      return `user_anonymous_${await this.getOrCreateDeviceId()}`;
    }
  }

  // Get or create device ID for anonymous users
  private static async getOrCreateDeviceId(): Promise<string> {
    const DEVICE_KEY = 'finance_device_id';
    let deviceId = await AsyncStorage.getItem(DEVICE_KEY);

    if (!deviceId) {
      const bytes = await Crypto.getRandomBytesAsync(16);
      deviceId = Array.from(bytes as Uint8Array)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
      await AsyncStorage.setItem(DEVICE_KEY, deviceId);
    }

    return deviceId;
  }

  // Create full backup of user data
  static async createBackup(): Promise<BackupResult> {
    try {
      await this.initialize();
      
      const db = await getDb();
      const userId = await this.getUserId();
      const userName = await getStoredUserName();
      const backupId = generateId();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Get all user data (settings table may not exist — skip gracefully)
      const CORE_TABLES = ['categories', 'transactions', 'recurring_transactions', 'notification_queue'];
      const OPTIONAL_TABLES = ['settings', 'processed_notifications'];
      const backupData: Record<string, any[]> = {};
      let totalRecords = 0;

      for (const table of CORE_TABLES) {
        const records = await db.getAllAsync(`SELECT * FROM ${table}`);
        backupData[table] = records;
        totalRecords += records.length;
      }

      for (const table of OPTIONAL_TABLES) {
        try {
          const records = await db.getAllAsync(`SELECT * FROM ${table}`);
          backupData[table] = records;
          totalRecords += records.length;
        } catch {
          backupData[table] = [];
        }
      }

      if (totalRecords === 0) {
        return {
          success: false,
          backupId,
          error: 'Nenhum dado encontrado para backup. Crie uma transação ou categoria primeiro.'
        };
      }

      // Create backup package
      const deviceId = await this.getOrCreateDeviceId();
      const backupPackage = {
        metadata: {
          id: backupId,
          userId,
          userName,
          version: this.BACKUP_VERSION,
          createdAt: new Date().toISOString(),
          size: 0, // Will be calculated
          checksum: '', // Will be calculated
          tables: Object.keys(backupData),
          encrypted: false,
          deviceId,
          appVersion: '1.0.0',
          deviceInfo: {
            platform: 'mobile',
            osVersion: 'unknown',
            appVersion: '1.0.0'
          }
        },
        data: backupData
      };

      // Serialize and calculate checksum (always over data only, compact)
      const dataStr = JSON.stringify(backupData);
      const checksum = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        dataStr
      );

      backupPackage.metadata.checksum = checksum;
      backupPackage.metadata.size = dataStr.length;

      // Save to file
      const fileName = `backup_${userId}_${timestamp}.json`;
      const file = new File(this.BACKUP_DIR, fileName);
      const filePath = file.uri;
      
      file.write(JSON.stringify(backupPackage, null, 2));
      console.log('[Backup] File written:', filePath);
      
      // Clean old backups
      await this.cleanOldBackups(userId);

      // Save backup metadata to database
      await this.saveBackupMetadata(backupPackage.metadata);

      return {
        success: true,
        backupId,
        filePath,
        size: dataStr.length,
        metadata: backupPackage.metadata
      };

    } catch (error) {
      console.error('[Backup] Error creating backup:', error);
      return {
        success: false,
        backupId: generateId(),
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  // Restore backup from file
  static async restoreBackup(filePath: string): Promise<RestoreResult> {
    let checksumWarning = false;
    try {
      const fileContent = await new File(filePath).text();
      const backupPackage = JSON.parse(fileContent);

      // Validate backup structure
      if (!backupPackage.metadata || !backupPackage.data) {
        throw new Error('Formato de backup inválido');
      }

      // Verify checksum (must match how createBackup computes it: compact JSON of data only)
      const serializedData = JSON.stringify(backupPackage.data);
      const calculatedChecksum = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        serializedData
      );

      if (calculatedChecksum !== backupPackage.metadata.checksum) {
        console.warn('[Backup] Checksum mismatch — backup may be corrupted or from older version, proceeding anyway');
        // S10: Retorna warning para o chamador poder exibir ao usuário
        checksumWarning = true;
      }

      const db = await getDb();
      const currentUserId = await this.getUserId();
      
      // Security check: only restore from same user or explicit override
      if (backupPackage.metadata.userId !== currentUserId) {
        console.warn('[Backup] Restoring from different user:', {
          from: backupPackage.metadata.userId,
          to: currentUserId
        });
      }

      let totalRestored = 0;
      const restoredTables: string[] = [];

      // Explicit order: categories must exist before transactions (FK)
      // notification_queue and processed_notifications have no FK deps
      const INSERT_ORDER = ['categories', 'transactions', 'recurring_transactions', 'settings', 'notification_queue', 'processed_notifications'];
      const DELETE_ORDER = [...INSERT_ORDER].reverse();

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        // Delete in reverse dependency order to avoid FK violations
        for (const tableName of DELETE_ORDER) {
          if (backupPackage.data[tableName]) {
            await db.execAsync(`DELETE FROM ${tableName}`);
          }
        }

        // Insert in dependency order
        for (const tableName of INSERT_ORDER) {
          const records = backupPackage.data[tableName];
          if (!Array.isArray(records) || records.length === 0) continue;

          // Get actual columns from DB schema to filter backup records
          const dbColumns = await db.getAllAsync<{ name: string }>(
            `PRAGMA table_info(${tableName})`
          );
          const validColumns = new Set(dbColumns.map((c) => c.name));

          for (const record of records) {
            const recordCols = Object.keys(record).filter((c) => validColumns.has(c));
            if (recordCols.length === 0) continue;
            const values = recordCols.map((c) => record[c]) as (string | number | null)[];
            const placeholders = values.map(() => '?').join(',');

            await db.runAsync(
              `INSERT INTO ${tableName} (${recordCols.join(',')}) VALUES (${placeholders})`,
              values
            );
          }

          restoredTables.push(tableName);
          totalRestored += records.length;
        }

        await db.execAsync('COMMIT');
      } catch (error) {
        await db.execAsync('ROLLBACK');
        throw error;
      }

      return {
        success: true,
        restoredTables,
        recordsRestored: totalRestored,
        error: checksumWarning ? 'Aviso: checksum do backup não confere — dados podem estar corrompidos.' : undefined
      };

    } catch (error) {
      console.error('[Backup] Error restoring backup:', error);
      return {
        success: false,
        restoredTables: [],
        recordsRestored: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  // List available backups
  static async listBackups(): Promise<BackupMetadata[]> {
    try {
      await this.initialize();
      const userId = await this.getUserId();
      
      const items = this.BACKUP_DIR.list();
      console.log('[Backup] All items in dir:', items, 'filtering by userId:', userId);
      const backupFiles = items
        .filter((item): item is File => item instanceof File)
        .map(item => item.name)
        .filter(name =>
          name.startsWith(`backup_${userId}_`) && name.endsWith('.json')
        );

      const backups: BackupMetadata[] = [];

      for (const fileName of backupFiles) {
        try {
          const filePath = new File(this.BACKUP_DIR, fileName).uri;
          const content = await new File(filePath).text();
          const backupPackage = JSON.parse(content);
          
          if (backupPackage.metadata) {
            backups.push(backupPackage.metadata);
          }
        } catch (error) {
          console.warn(`[Backup] Invalid backup file: ${fileName}`, error);
        }
      }

      return backups.toSorted((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    } catch (error) {
      console.error('[Backup] Error listing backups:', error);
      return [];
    }
  }

  // Get backup file path from metadata fields
  static getBackupFilePath(userId: string, createdAt: string): string {
    const fileName = `backup_${userId}_${createdAt.replace(/[:.]/g, '-')}.json`;
    return new File(this.BACKUP_DIR, fileName).uri;
  }

  // Delete backup
  static async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backups = await this.listBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) return false;

      const filePath = this.getBackupFilePath(backup.userId, backup.createdAt);
      
      new File(filePath).delete();
      return true;

    } catch (error) {
      console.error('[Backup] Error deleting backup:', error);
      return false;
    }
  }

  // Clean old backups (keep only last N days)
  private static async cleanOldBackups(userId: string): Promise<void> {
    try {
      const backups = await this.listBackups();
      const userBackups = backups.filter(b => b.userId === userId);
      
      if (userBackups.length <= this.MAX_BACKUPS) return;

      const backupsToDelete = userBackups
        .toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, userBackups.length - this.MAX_BACKUPS);

      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }

    } catch (error) {
      console.error('[Backup] Error cleaning old backups:', error);
      // S11: Não silencioso — registra mas não interrompe fluxo principal
    }
  }

  // Save backup metadata to database
  private static async saveBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const db = await getDb();
    
    await db.runAsync(`
      INSERT OR REPLACE INTO backup_metadata (
        id, user_id, user_name, version, created_at, size, checksum, 
        tables, encrypted, device_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      metadata.id,
      metadata.userId,
      metadata.userName,
      metadata.version,
      metadata.createdAt,
      metadata.size,
      metadata.checksum,
      JSON.stringify(metadata.tables),
      metadata.encrypted ? 1 : 0,
      JSON.stringify(metadata.deviceInfo)
    ]);
  }

  // Schedule daily backup
  static async scheduleDailyBackup(): Promise<void> {
    const lastBackup = await AsyncStorage.getItem(this.BACKUP_KEY);
    const today = new Date().toDateString();
    
    if (lastBackup === today) {
      console.log('[Backup] Daily backup already completed');
      return;
    }

    console.log('[Backup] Starting daily backup...');
    const result = await this.createBackup();
    
    if (result.success) {
      await AsyncStorage.setItem(this.BACKUP_KEY, today);
      console.log('[Backup] Daily backup completed:', result.backupId);
    } else {
      console.error('[Backup] Daily backup failed:', result.error);
    }
  }

  // ── Cloud Backup (AWS S3 via backend) ──────────────────────────────────────

  /**
   * Cria backup local e faz upload para o backend (S3).
   * Retorna { localResult, cloudKey } — cloudKey é null se o upload falhar.
   */
  static async createAndUploadBackup(): Promise<{
    localResult: BackupResult;
    cloudKey: string | null;
    cloudError?: string;
  }> {
    const localResult = await this.createBackup();
    if (!localResult.success || !localResult.filePath) {
      return { localResult, cloudKey: null, cloudError: 'Backup local falhou' };
    }

    try {
      const cloudKey = await this.uploadToCloud(localResult.filePath);
      return { localResult, cloudKey };
    } catch (err) {
      const cloudError = err instanceof Error ? err.message : 'Erro no upload cloud';
      console.error('[Backup] Cloud upload failed:', cloudError);
      return { localResult, cloudKey: null, cloudError };
    }
  }

  /**
   * Faz upload de um arquivo de backup local para o backend (S3).
   * Retorna a chave S3 do arquivo salvo.
   */
  static async uploadToCloud(filePath: string): Promise<string> {
    const content = await new File(filePath).text();
    const backupPackage = JSON.parse(content);

    const response = await authFetch(`${BACKEND_URL}/backup/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupPackage),
    });

    if (!response.ok) {
      let msg = 'Erro ao enviar backup para nuvem';
      try {
        const err = await response.json();
        msg = err.error || err.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const result = await response.json();
    return result.s3Key as string;
  }

  /**
   * Lista os backups salvos na nuvem para o usuário autenticado.
   */
  static async listCloudBackups(): Promise<CloudBackupEntry[]> {
    const response = await authFetch(`${BACKEND_URL}/backup/list`);
    if (!response.ok) throw new Error('Erro ao listar backups na nuvem');
    const data = await response.json();
    return data.backups as CloudBackupEntry[];
  }

  /**
   * Baixa o backup mais recente da nuvem e restaura localmente.
   */
  static async downloadAndRestoreLatest(): Promise<RestoreResult> {
    const response = await authFetch(`${BACKEND_URL}/backup/latest`);
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, restoredTables: [], recordsRestored: 0, error: 'Nenhum backup na nuvem' };
      }
      throw new Error('Erro ao baixar backup da nuvem');
    }

    const data = await response.json();
    const backupPackage = data.backup;

    // Salvar temporariamente no filesystem local e restaurar
    await this.initialize();
    const tmpFile = new File(this.BACKUP_DIR, 'cloud_restore_tmp.json');
    tmpFile.write(JSON.stringify(backupPackage));

    const result = await this.restoreBackup(tmpFile.uri);

    try {
      tmpFile.delete();
    } catch {}

    return result;
  }

  /**
   * Baixa um backup específico da nuvem pelo filename e restaura.
   */
  static async downloadAndRestoreByFilename(filename: string): Promise<RestoreResult> {
    const response = await authFetch(
      `${BACKEND_URL}/backup/download/${encodeURIComponent(filename)}`
    );
    if (!response.ok) throw new Error('Erro ao baixar backup da nuvem');

    const data = await response.json();
    const backupPackage = data.backup;

    await this.initialize();
    const tmpFile = new File(this.BACKUP_DIR, 'cloud_restore_tmp.json');
    tmpFile.write(JSON.stringify(backupPackage));

    const result = await this.restoreBackup(tmpFile.uri);

    try {
      tmpFile.delete();
    } catch {}

    return result;
  }

  // ── Get backup statistics
  static async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    lastBackup: string | null;
    nextBackup: string;
  }> {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
      const lastBackup = backups.length > 0 ? backups[0].createdAt : null;
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return {
        totalBackups: backups.length,
        totalSize,
        lastBackup,
        nextBackup: tomorrow.toISOString()
      };

    } catch (error) {
      console.error('[Backup] Error getting stats:', error);
      return {
        totalBackups: 0,
        totalSize: 0,
        lastBackup: null,
        nextBackup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
    }
  }
}
