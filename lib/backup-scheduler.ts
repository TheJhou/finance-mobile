import { BackupSystem } from '@/lib/backup';
import { getDb } from '@/lib/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────

export interface BackupSchedule {
  id: string;
  userId: string;
  isActive: boolean;
  backupTime: string; // HH:MM format
  lastBackup: string | null;
  nextBackup: string;
}

export interface SchedulerConfig {
  enabled: boolean;
  backupTime: string;
  requireWifi: boolean;
  requireCharging: boolean;
  maxRetries: number;
  retryDelay: number; // minutes
}

// ── Backup Scheduler ────────────────────────────────────────────────────

export class BackupScheduler {
  private static appStateSub: { remove: () => void } | null = null;
  private static readonly SCHEDULE_KEY = 'backup_scheduler_config';
  private static readonly LAST_RUN_KEY = 'backup_scheduler_last_run';
  private static readonly NOTIFICATION_ID = 'backup-daily';
  
  private static isInitialized = false;
  private static config: SchedulerConfig = {
    enabled: true,
    backupTime: '02:00', // 2 AM
    requireWifi: false,
    requireCharging: false,
    maxRetries: 3,
    retryDelay: 30 // minutes
  };

  // Initialize the scheduler
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load configuration
      await this.loadConfig();
      
      // Set up notification channel
      await this.setupNotificationChannel();
      
      // Schedule daily backup notification
      await this.scheduleDailyNotification();
      
      // Check if we need to run a backup
      await this.checkAndRunBackup();
      
      // Set up app state listeners
      this.setupAppStateListeners();
      
      this.isInitialized = true;
      console.log('[BackupScheduler] Initialized successfully');
      
    } catch (error) {
      console.error('[BackupScheduler] Initialization failed:', error);
    }
  }

  // Load configuration from storage
  private static async loadConfig(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.SCHEDULE_KEY);
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('[BackupScheduler] Failed to load config:', error);
    }
  }

  // Save configuration to storage
  static async saveConfig(config: Partial<SchedulerConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };
      await AsyncStorage.setItem(this.SCHEDULE_KEY, JSON.stringify(this.config));
      
      // Reschedule if time changed
      if (config.backupTime) {
        await this.scheduleDailyNotification();
      }
      
      console.log('[BackupScheduler] Configuration updated:', this.config);
    } catch (error) {
      console.error('[BackupScheduler] Failed to save config:', error);
    }
  }

  // Get current configuration
  static getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  // Setup notification channel for Android
  private static async setupNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('backup-reminders', {
        name: 'Lembretes de Backup',
        description: 'Notificações sobre backup automático de dados',
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: [0, 250],
        lightColor: '#6366f1',
      });
    }
  }

  // Schedule daily backup notification
  private static async scheduleDailyNotification(): Promise<void> {
    try {
      // Cancel existing notifications
      await Notifications.cancelScheduledNotificationAsync(this.NOTIFICATION_ID);
      
      if (!this.config.enabled) return;

      const [hours, minutes] = this.config.backupTime.split(':').map(Number);
      const now = new Date();
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      // If time has passed today, schedule for tomorrow
      if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      const trigger = scheduledTime.getTime() - Date.now();
      
      await Notifications.scheduleNotificationAsync({
        identifier: this.NOTIFICATION_ID,
        content: {
          title: 'Backup Diário',
          body: 'Seus dados financeiros serão backupados automaticamente',
          data: { type: 'backup_scheduled' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.floor(trigger / 1000) },
      });

      console.log('[BackupScheduler] Daily notification scheduled for:', scheduledTime);
      
    } catch (error) {
      console.error('[BackupScheduler] Failed to schedule notification:', error);
    }
  }

  // Setup app state listeners to trigger backup when app becomes active
  private static setupAppStateListeners(): void {
    if (this.appStateSub) this.appStateSub.remove();
    this.appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Check if we missed a scheduled backup
        this.checkAndRunBackup();
      }
    });
  }

  static cleanup(): void {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
  }

  // Check if backup should run and execute it
  private static async checkAndRunBackup(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const lastRun = await AsyncStorage.getItem(this.LAST_RUN_KEY);
      const today = new Date().toDateString();
      
      // Already ran today
      if (lastRun === today) {
        console.log('[BackupScheduler] Backup already completed today');
        return;
      }

      // Check if it's time to run
      const now = new Date();
      const [hours, minutes] = this.config.backupTime.split(':').map(Number);
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      // If we're past the scheduled time, run the backup
      if (now >= scheduledTime) {
        await this.runBackup();
      }
      
    } catch (error) {
      console.error('[BackupScheduler] Failed to check backup:', error);
    }
  }

  // Run the backup with retry logic
  static async runBackup(): Promise<void> {
    if (!this.config.enabled) return;

    console.log('[BackupScheduler] Starting scheduled backup...');
    
    let retryCount = 0;
    
    while (retryCount <= this.config.maxRetries) {
      try {
        // Local backup doesn't need network — always create it
        const localResult = await BackupSystem.createBackup();

        if (localResult.success) {
          // Mark as completed
          await AsyncStorage.setItem(this.LAST_RUN_KEY, new Date().toDateString());

          // Try cloud upload separately (best-effort, doesn't block local backup)
          let cloudStatus = '';
          if (await this.checkPreconditions() && localResult.filePath) {
            try {
              const cloudKey = await BackupSystem.uploadToCloud(localResult.filePath);
              cloudStatus = cloudKey ? ' (nuvem OK)' : ' (nuvem falhou)';
            } catch (cloudErr) {
              cloudStatus = ' (nuvem falhou)';
              console.warn('[BackupScheduler] Cloud upload failed:', cloudErr);
            }
          } else {
            cloudStatus = ' (offline — nuvem pendente)';
          }

          // Show success notification
          await this.showNotification(
            'Backup Concluído',
            `Seus dados foram backupados com sucesso (${this.formatFileSize(localResult.size || 0)})${cloudStatus}`,
            'success'
          );

          // Save to database
          await this.saveBackupRecord(localResult);

          console.log('[BackupScheduler] Backup completed successfully');
          return;
        } else {
          throw new Error(localResult.error || 'Backup failed');
        }
        
      } catch (error) {
        retryCount++;
        console.error(`[BackupScheduler] Backup attempt ${retryCount} failed:`, error);
        
        if (retryCount <= this.config.maxRetries) {
          // Wait before retry
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay * 60 * 1000)
          );
        }
      }
    }
    
    // All retries failed
    await this.showNotification(
      'Backup Falhou',
      `Não foi possível fazer o backup após ${this.config.maxRetries} tentativas`,
      'error'
    );
  }

  // Check backup preconditions (wifi, charging, etc.)
  private static async checkPreconditions(): Promise<boolean> {
    try {
      // Check network connectivity
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('[BackupScheduler] No network connection, skipping backup');
        return false;
      }

      // Check Wi-Fi requirement
      if (this.config.requireWifi && netState.type !== 'wifi') {
        console.log('[BackupScheduler] Wi-Fi required but not connected, skipping backup');
        return false;
      }

      // Storage check skipped: expo-file-system legacy does not expose freeSpace on FileInfo
      // In production, use a native module or capacitor plugin for precise free space

      return true;
    } catch (error) {
      console.error('[BackupScheduler] Failed to check preconditions:', error);
      return false;
    }
  }

  // Show notification
  private static async showNotification(title: string, body: string, type: 'success' | 'error' | 'info'): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: `backup_${type}` },
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('[BackupScheduler] Failed to show notification:', error);
    }
  }

  // Save backup record to database
  private static async saveBackupRecord(result: any): Promise<void> {
    try {
      const db = await getDb();
      const userId = await this.getCurrentUserId();
      
      await db.runAsync(`
        INSERT OR REPLACE INTO backup_schedule (
          id, user_id, last_backup, next_backup, is_active, backup_time, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        `schedule_${userId}`,
        userId,
        new Date().toISOString(),
        this.getNextBackupTime(),
        this.config.enabled ? 1 : 0,
        this.config.backupTime,
        new Date().toISOString()
      ]);
      
    } catch (error) {
      console.error('[BackupScheduler] Failed to save backup record:', error);
    }
  }

  // Get current user ID — delegates to BackupSystem so filenames always match
  private static async getCurrentUserId(): Promise<string> {
    return BackupSystem.getPublicUserId();
  }

  // Get next backup time
  private static getNextBackupTime(): string {
    const [hours, minutes] = this.config.backupTime.split(':').map(Number);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);
    return tomorrow.toISOString();
  }

  // Format file size
  private static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Get backup statistics
  static async getStats(): Promise<{
    enabled: boolean;
    lastBackup: string | null;
    nextBackup: string;
    totalBackups: number;
    config: SchedulerConfig;
  }> {
    try {
      const stats = await BackupSystem.getBackupStats();
      const lastRun = await AsyncStorage.getItem(this.LAST_RUN_KEY);
      
      return {
        enabled: this.config.enabled,
        lastBackup: lastRun,
        nextBackup: this.getNextBackupTime(),
        totalBackups: stats.totalBackups,
        config: this.getConfig()
      };
    } catch (error) {
      console.error('[BackupScheduler] Failed to get stats:', error);
      return {
        enabled: false,
        lastBackup: null,
        nextBackup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        totalBackups: 0,
        config: this.getConfig()
      };
    }
  }

  // Enable/disable scheduler
  static async setEnabled(enabled: boolean): Promise<void> {
    await this.saveConfig({ enabled });
    
    if (enabled) {
      await this.scheduleDailyNotification();
      await this.checkAndRunBackup();
    } else {
      await Notifications.cancelScheduledNotificationAsync(this.NOTIFICATION_ID);
    }
  }

  // Set backup time
  static async setBackupTime(time: string): Promise<void> {
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      throw new Error('Invalid time format. Use HH:MM');
    }
    
    await this.saveConfig({ backupTime: time });
  }

  // Force run backup now
  static async runBackupNow(): Promise<void> {
    await this.runBackup();
  }
}
