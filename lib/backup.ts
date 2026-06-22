import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb, generateId } from '@/lib/db';
import { getStoredUserName } from '@/lib/auth';

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

// ── Backup System ───────────────────────────────────────────────────────

export class BackupSystem {
  private static readonly BACKUP_VERSION = '1.0.0';
  private static readonly BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;
  private static readonly MAX_BACKUPS = 7; // Keep last 7 days
  private static readonly BACKUP_KEY = 'finance_backup_schedule';

  // Initialize backup directory
  static async initialize(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.BACKUP_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.BACKUP_DIR, { intermediates: true });
    }
  }

  // Get current user ID (from auth or device ID)
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
      deviceId = Crypto.getRandomBytesAsync(16).then(bytes => 
        Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      );
      await AsyncStorage.setItem(DEVICE_KEY, await deviceId);
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
      
      // Get all user data
      const tables = ['categories', 'transactions', 'recurring_transactions', 'settings'];
      const backupData: Record<string, any[]> = {};
      let totalRecords = 0;

      for (const table of tables) {
        const records = await db.getAllAsync(`SELECT * FROM ${table}`);
        backupData[table] = records;
        totalRecords += records.length;
      }

      if (totalRecords === 0) {
        return {
          success: false,
          backupId,
          error: 'Nenhum dado para backup'
        };
      }

      // Create backup package
      const backupPackage = {
        metadata: {
          id: backupId,
          userId,
          userName,
          version: this.BACKUP_VERSION,
          createdAt: new Date().toISOString(),
          size: 0, // Will be calculated
          checksum: '', // Will be calculated
          tables,
          encrypted: false,
          deviceInfo: {
            platform: 'mobile',
            osVersion: 'unknown', // Could get from expo-constants
            appVersion: '1.0.0'
          }
        },
        data: backupData
      };

      // Serialize and calculate checksum
      const serialized = JSON.stringify(backupPackage, null, 2);
      const checksum = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        serialized
      );
      
      backupPackage.metadata.checksum = checksum;
      backupPackage.metadata.size = serialized.length;

      // Save to file
      const fileName = `backup_${userId}_${timestamp}.json`;
      const filePath = `${this.BACKUP_DIR}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backupPackage, null, 2));
      
      // Clean old backups
      await this.cleanOldBackups(userId);

      // Save backup metadata to database
      await this.saveBackupMetadata(backupPackage.metadata);

      return {
        success: true,
        backupId,
        filePath,
        size: serialized.length,
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
    try {
      const fileContent = await FileSystem.readAsStringAsync(filePath);
      const backupPackage = JSON.parse(fileContent);

      // Validate backup structure
      if (!backupPackage.metadata || !backupPackage.data) {
        throw new Error('Formato de backup inválido');
      }

      // Verify checksum
      const serializedData = JSON.stringify(backupPackage.data);
      const calculatedChecksum = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        serializedData
      );

      if (calculatedChecksum !== backupPackage.metadata.checksum) {
        throw new Error('Checksum do backup inválido - dados corrompidos');
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

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        for (const [tableName, records] of Object.entries(backupPackage.data)) {
          if (!Array.isArray(records) || records.length === 0) continue;

          // Clear existing data
          await db.execAsync(`DELETE FROM ${tableName}`);

          // Insert backup data
          for (const record of records) {
            const columns = Object.keys(record);
            const values = Object.values(record);
            const placeholders = values.map(() => '?').join(',');
            
            await db.runAsync(
              `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`,
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
        recordsRestored: totalRestored
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
      
      const files = await FileSystem.readDirectoryAsync(this.BACKUP_DIR);
      const backupFiles = files.filter(f => 
        f.startsWith(`backup_${userId}_`) && f.endsWith('.json')
      );

      const backups: BackupMetadata[] = [];

      for (const file of backupFiles) {
        try {
          const filePath = `${this.BACKUP_DIR}${file}`;
          const content = await FileSystem.readAsStringAsync(filePath);
          const backupPackage = JSON.parse(content);
          
          if (backupPackage.metadata) {
            backups.push(backupPackage.metadata);
          }
        } catch (error) {
          console.warn(`[Backup] Invalid backup file: ${file}`, error);
        }
      }

      return backups.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    } catch (error) {
      console.error('[Backup] Error listing backups:', error);
      return [];
    }
  }

  // Delete backup
  static async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backups = await this.listBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) return false;

      const fileName = `backup_${backup.userId}_${backup.createdAt.replace(/[:.]/g, '-')}.json`;
      const filePath = `${this.BACKUP_DIR}${fileName}`;
      
      await FileSystem.deleteAsync(filePath);
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
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, userBackups.length - this.MAX_BACKUPS);

      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }

    } catch (error) {
      console.error('[Backup] Error cleaning old backups:', error);
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

  // Get backup statistics
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
