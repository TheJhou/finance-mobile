import { useAppDialog } from "@/hooks/use-app-dialog";
import { BackupMetadata, BackupSystem, CloudBackupEntry } from "@/lib/backup";
import { BackupScheduler } from "@/lib/backup-scheduler";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from 'expo-file-system';
import { useFocusEffect } from "expo-router";
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function BackupScreen() {
  const styles = useThemedStyles(createStyles);
  const [loading, setLoading] = useState(true);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupMetadata | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [schedulerConfig, setSchedulerConfig] = useState({
    enabled: true,
    backupTime: "02:00",
  });
  const [uploadingCloud, setUploadingCloud] = useState(false);
  const [restoringCloud, setRestoringCloud] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupEntry[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [stats, setStats] = useState({
    totalBackups: 0,
    totalSize: 0,
    lastBackup: null as string | null,
    nextBackup: "",
  });
  const { alert, confirm, dialog } = useAppDialog();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [backupList, backupStats, schedulerStats] = await Promise.all([
        BackupSystem.listBackups(),
        BackupSystem.getBackupStats(),
        BackupScheduler.getStats(),
      ]);

      // Load cloud backups — only if authenticated
      try {
        setLoadingCloud(true);
        setCloudError(null);
        const { isAuthenticated } = await import("@/lib/auth");
        const authed = await isAuthenticated();
        if (authed) {
          const cloud = await BackupSystem.listCloudBackups();
          setCloudBackups(cloud);
        } else {
          setCloudBackups([]);
        }
      } catch (error) {
        setCloudBackups([]);
        const msg = error instanceof Error ? error.message : "Erro ao carregar backups da nuvem";
        setCloudError(msg);
        console.warn("[Backup] Cloud list error:", msg);
      } finally {
        setLoadingCloud(false);
      }
      
      setBackups(backupList);
      setStats({
        totalBackups: backupStats.totalBackups,
        totalSize: backupStats.totalSize,
        lastBackup: backupStats.lastBackup,
        nextBackup: backupStats.nextBackup,
      });
      setSchedulerConfig({
        enabled: schedulerStats.enabled,
        backupTime: schedulerStats.config.backupTime,
      });
      
    } catch (error) {
      console.error("[Backup] Error loading data:", error);
      alert("Erro", "Não foi possível carregar os dados de backup", { variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      const result = await BackupSystem.createBackup();

      if (!result.success) {
        alert("Erro", result.error || "Falha ao criar backup", { variant: "danger" });
        return;
      }
      await loadData();
      alert(
        "Sucesso",
        `Backup local criado com sucesso!\n\nTamanho: ${formatFileSize(result.size || 0)}`,
        { variant: "success" }
      );
    } catch (error) {
      console.error("[Backup] Error creating backup:", error);
      alert("Erro", "Falha ao criar backup", { variant: "danger" });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backup: BackupMetadata) => {
    setSelectedBackup(backup);
    setShowRestoreModal(true);
  };

  const confirmRestore = () => {
    if (!selectedBackup) return;

    confirm(
      "Confirmar Restauração",
      "Isso substituirá todos os seus dados atuais. Deseja continuar?",
      {
        variant: "warning",
        confirmText: "Restaurar",
        onConfirm: async () => {
          try {
            setRestoring(true);
            const filePath = BackupSystem.getBackupFilePathFromMetadata(selectedBackup);
            
            const result = await BackupSystem.restoreBackup(filePath);
            
            if (result.success) {
              const warning = result.error ? `\n\n⚠️ ${result.error}` : "";
              alert(
                "Sucesso",
                `Backup restaurado com sucesso!\n\nTabelas: ${result.restoredTables.join(", ")}\nRegistros: ${result.recordsRestored}${warning}`,
                { variant: "success" }
              );
              await loadData();
            } else {
              alert("Erro", result.error || "Falha ao restaurar backup", { variant: "danger" });
            }
          } catch (error) {
            console.error("[Backup] Error restoring backup:", error);
            alert("Erro", "Falha ao restaurar backup", { variant: "danger" });
          } finally {
            setRestoring(false);
            setShowRestoreModal(false);
            setSelectedBackup(null);
          }
        },
        onCancel: () => {
          setRestoring(false);
          setShowRestoreModal(false);
          setSelectedBackup(null);
        },
      }
    );
  };

  const handleDeleteBackup = async (backup: BackupMetadata) => {
    confirm(
      "Confirmar Exclusão",
      `Deseja excluir o backup de ${new Date(backup.createdAt).toLocaleDateString("pt-BR")}?`,
      {
        variant: "danger",
        confirmText: "Excluir",
        onConfirm: async () => {
          try {
            const success = await BackupSystem.deleteBackup(backup.id);
            if (success) {
              alert("Sucesso", "Backup excluído", { variant: "success" });
              await loadData();
            } else {
              alert("Erro", "Falha ao excluir backup", { variant: "danger" });
            }
          } catch (error) {
            console.error("[Backup] Error deleting backup:", error);
            alert("Erro", "Falha ao excluir backup", { variant: "danger" });
          }
        },
      }
    );
  };

  const handleCloudBackup = async () => {
    try {
      setUploadingCloud(true);

      const { isAuthenticated } = await import("@/lib/auth");
      const authed = await isAuthenticated();
      if (!authed) {
        alert(
          "Login necessário",
          "Faça login na aba Importar para usar o backup na nuvem.",
          { variant: "warning" }
        );
        return;
      }

      const { localResult, cloudError } = await BackupSystem.createAndUploadBackup();

      if (!localResult.success) {
        alert("Erro", localResult.error || "Falha ao criar backup", { variant: "danger" });
        return;
      }
      await loadData();
      if (cloudError) {
        alert(
          "Backup local criado",
          `Backup salvo localmente, mas o envio para a nuvem falhou:\n\n${cloudError}`,
          { variant: "warning" }
        );
      } else {
        alert("Sucesso", `Backup enviado para a nuvem com sucesso!`, { variant: "success" });
      }
    } catch (error) {
      console.error("[Backup] Cloud error:", error);
      alert("Erro", error instanceof Error ? error.message : "Falha ao fazer backup na nuvem", { variant: "danger" });
    } finally {
      setUploadingCloud(false);
    }
  };

  const handleRestoreFromCloud = async () => {
    confirm(
      "Restaurar da Nuvem",
      "Isso substituirá todos os seus dados pelo backup mais recente na nuvem. Deseja continuar?",
      {
        variant: "warning",
        confirmText: "Restaurar",
        onConfirm: async () => {
          try {
            setRestoringCloud(true);
            const result = await BackupSystem.downloadAndRestoreLatest();
            if (result.success) {
              alert("Sucesso", `Dados restaurados da nuvem!\n\nRegistros: ${result.recordsRestored}`, { variant: "success" });
              await loadData();
            } else {
              alert("Erro", result.error || "Falha ao restaurar da nuvem", { variant: "danger" });
            }
          } catch {
            alert("Erro", "Falha ao restaurar da nuvem", { variant: "danger" });
          } finally {
            setRestoringCloud(false);
          }
        },
      }
    );
  };

  const handleDeleteCloudBackup = (item: CloudBackupEntry) => {
    confirm(
      "Excluir Backup da Nuvem",
      `Deseja excluir o backup "${item.filename}" da nuvem?\nEsta ação não pode ser desfeita.`,
      {
        variant: "danger",
        confirmText: "Excluir",
        onConfirm: async () => {
          try {
            setLoadingCloud(true);
            await BackupSystem.deleteCloudBackup(item.filename);
            alert("Sucesso", "Backup excluído da nuvem", { variant: "success" });
            await loadData();
          } catch (error) {
            alert("Erro", error instanceof Error ? error.message : "Falha ao excluir backup da nuvem", { variant: "danger" });
          } finally {
            setLoadingCloud(false);
          }
        },
      }
    );
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const filePath = result.assets[0].uri;
      const restoreResult = await BackupSystem.restoreBackup(filePath);

      if (restoreResult.success) {
        alert(
          "Sucesso",
          `Backup importado e restaurado!\n\nTabelas: ${restoreResult.restoredTables.join(", ")}\nRegistros: ${restoreResult.recordsRestored}`,
          { variant: "success" }
        );
        await loadData();
      } else {
        alert("Erro", restoreResult.error || "Falha ao importar backup", { variant: "danger" });
      }
    } catch (error) {
      console.error("[Backup] Error importing backup:", error);
      alert("Erro", "Falha ao importar backup", { variant: "danger" });
    }
  };

  const handleExportBackup = async (backup: BackupMetadata) => {
    try {
      const filePath = BackupSystem.getBackupFilePathFromMetadata(backup);
      
      if (new File(filePath).exists) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Compartilhar Backup",
        });
      } else {
        alert("Erro", "Arquivo de backup não encontrado", { variant: "danger" });
      }
    } catch (error) {
      console.error("[Backup] Error exporting backup:", error);
      alert("Erro", "Falha ao exportar backup", { variant: "danger" });
    }
  };

  const toggleScheduler = async () => {
    try {
      await BackupScheduler.setEnabled(!schedulerConfig.enabled);
      setSchedulerConfig(prev => ({ ...prev, enabled: !prev.enabled }));
    } catch (error) {
      console.error("[Backup] Error toggling scheduler:", error);
      alert("Erro", "Falha ao alterar configuração", { variant: "danger" });
    }
  };

  const saveBackupTime = async () => {
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(editingTime)) {
      alert("Erro", "Formato de hora inválido. Use HH:MM", { variant: "danger" });
      return;
    }

    try {
      await BackupScheduler.setBackupTime(editingTime);
      setSchedulerConfig(prev => ({ ...prev, backupTime: editingTime }));
      setShowTimeModal(false);
      setEditingTime("");
      alert("Sucesso", "Horário de backup atualizado", { variant: "success" });
    } catch (error) {
      console.error("[Backup] Error saving backup time:", error);
      alert("Erro", "Falha ao salvar horário", { variant: "danger" });
    }
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Backup e Restauração</Text>
          <Text style={styles.subtitle}>Proteja seus dados financeiros</Text>
        </View>

        {/* Stats Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estatísticas</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalBackups}</Text>
              <Text style={styles.statLabel}>Backups</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatFileSize(stats.totalSize)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {stats.lastBackup ? new Date(stats.lastBackup).toLocaleDateString("pt-BR") : "Nunca"}
              </Text>
              <Text style={styles.statLabel}>Último</Text>
            </View>
          </View>
        </View>

        {/* Scheduler Config */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Backup Automático</Text>
            <Pressable style={[styles.toggle, schedulerConfig.enabled && styles.toggleActive]} onPress={toggleScheduler}>
              <View style={[styles.toggleKnob, schedulerConfig.enabled && styles.toggleKnobActive]} />
            </Pressable>
          </View>
          
          {schedulerConfig.enabled && (
            <View style={styles.scheduleConfig}>
              <Text style={styles.scheduleLabel}>Horário:</Text>
              <Pressable style={styles.timeButton} onPress={() => {
                setEditingTime(schedulerConfig.backupTime);
                setShowTimeModal(true);
              }}>
                <Text style={styles.timeText}>{schedulerConfig.backupTime}</Text>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
              </Pressable>
              <Text style={styles.scheduleHint}>
                Próximo backup: {new Date(stats.nextBackup).toLocaleString("pt-BR")}
              </Text>
            </View>
          )}
        </View>

        {/* Actions — Local */}
        <View style={styles.actionsGrid}>
          <Pressable
            style={[styles.actionButton, styles.createButton]}
            onPress={handleCreateBackup}
            disabled={creatingBackup}
          >
            {creatingBackup ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Backup Local</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.importButton]}
            onPress={handleImportBackup}
          >
            <Ionicons name="folder-open-outline" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Importar</Text>
          </Pressable>
        </View>

        {/* Actions — Cloud */}
        <View style={styles.actionsGrid}>
          <Pressable
            style={[styles.actionButton, styles.cloudButton]}
            onPress={handleCloudBackup}
            disabled={uploadingCloud}
          >
            {uploadingCloud ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Backup Nuvem</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.restoreCloudButton]}
            onPress={handleRestoreFromCloud}
            disabled={restoringCloud}
          >
            {restoringCloud ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Restaurar Nuvem</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Cloud Backups List */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Backups na Nuvem</Text>
            {loadingCloud && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          {cloudBackups.length === 0 ? (
            <Text style={styles.emptyText}>
              {loadingCloud
                ? "Carregando..."
                : cloudError
                  ? `Erro ao carregar: ${cloudError}`
                  : "Nenhum backup na nuvem"}
            </Text>
          ) : (
            <FlatList
              data={cloudBackups}
              keyExtractor={(item) => item.key}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.backupItem}>
                  <View style={styles.backupInfo}>
                    <Text style={styles.backupDate}>
                      {formatDate(item.lastModified)}
                    </Text>
                    <Text style={styles.backupDetails}>
                      {formatFileSize(item.sizeBytes)} • {item.filename}
                    </Text>
                  </View>
                  <View style={styles.backupActions}>
                    <Pressable
                      style={styles.backupActionButton}
                      onPress={() => {
                        confirm(
                          "Restaurar",
                          `Restaurar o backup "${item.filename}"?\nIsso substituirá todos os dados atuais.`,
                          {
                            variant: "warning",
                            confirmText: "Restaurar",
                            onConfirm: async () => {
                              try {
                                setRestoringCloud(true);
                                const result = await BackupSystem.downloadAndRestoreByFilename(item.filename);
                                if (result.success) {
                                  alert("Sucesso", `Dados restaurados!\n\nRegistros: ${result.recordsRestored}`, { variant: "success" });
                                  await loadData();
                                } else {
                                  alert("Erro", result.error || "Falha ao restaurar", { variant: "danger" });
                                }
                              } catch {
                                alert("Erro", "Falha ao restaurar da nuvem", { variant: "danger" });
                              } finally {
                                setRestoringCloud(false);
                              }
                            },
                          }
                        );
                      }}
                    >
                      <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={styles.backupActionButton}
                      onPress={() => handleDeleteCloudBackup(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>

        {/* Backups List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backups Disponíveis</Text>
          {backups.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum backup encontrado</Text>
          ) : (
            <FlatList
              data={backups}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.backupItem}>
                  <View style={styles.backupInfo}>
                    <Text style={styles.backupDate}>{formatDate(item.createdAt)}</Text>
                    <Text style={styles.backupDetails}>
                      {formatFileSize(item.size)} • {item.tables.length} tabelas
                    </Text>
                    {item.fileName && (
                      <Text style={styles.backupFileName} numberOfLines={1}>{item.fileName}</Text>
                    )}
                    {item.userName && (
                      <Text style={styles.backupUser}>Usuário: {item.userName}</Text>
                    )}
                  </View>
                  <View style={styles.backupActions}>
                    <Pressable
                      style={styles.backupActionButton}
                      onPress={() => handleRestoreBackup(item)}
                    >
                      <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={styles.backupActionButton}
                      onPress={() => handleExportBackup(item)}
                    >
                      <Ionicons name="share-outline" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={styles.backupActionButton}
                      onPress={() => handleDeleteBackup(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Restore Modal */}
      <Modal visible={showRestoreModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Restaurar Backup</Text>
            {selectedBackup && (
              <View style={styles.modalInfo}>
                <Text style={styles.modalInfoText}>
                  Data: {formatDate(selectedBackup.createdAt)}
                </Text>
                <Text style={styles.modalInfoText}>
                  Tamanho: {formatFileSize(selectedBackup.size)}
                </Text>
                <Text style={styles.modalInfoText}>
                  Tabelas: {selectedBackup.tables.join(", ")}
                </Text>
              </View>
            )}
            <Text style={styles.modalWarning}>
              ⚠️ Isso substituirá todos os seus dados atuais!
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowRestoreModal(false);
                  setSelectedBackup(null);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={confirmRestore}
                disabled={restoring}
              >
                {restoring ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Restaurar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Modal */}
      <Modal visible={showTimeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Horário de Backup</Text>
            <TextInput
              style={styles.timeInput}
              value={editingTime}
              onChangeText={setEditingTime}
              placeholder="HH:MM"
              keyboardType="numeric"
              maxLength={5}
            />
            <Text style={styles.modalHint}>Formato: 00:00 a 23:59</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowTimeModal(false);
                  setEditingTime("");
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={saveBackupTime}
              >
                <Text style={styles.modalButtonTextConfirm}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {dialog}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  loadingText: { marginTop: spacing.md, color: colors.textSecondary, fontSize: 14 },
  
  header: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
  },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  
  toggle: {
    width: 48,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: "center",
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    marginLeft: 2,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
    marginRight: 2,
  },
  
  scheduleConfig: {
    gap: spacing.sm,
  },
  scheduleLabel: { fontSize: 14, color: colors.textSecondary },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeText: { fontSize: 16, fontWeight: "500", color: colors.textPrimary },
  scheduleHint: { fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
  
  actionsGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  createButton: { backgroundColor: colors.primary },
  importButton: { backgroundColor: colors.success },
  cloudButton: { backgroundColor: colors.info },
  restoreCloudButton: { backgroundColor: colors.primaryDark },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    fontStyle: "italic",
    paddingVertical: spacing.lg,
  },
  
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  
  backupItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backupInfo: { flex: 1 },
  backupDate: { fontSize: 14, fontWeight: "500", color: colors.textPrimary },
  backupDetails: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  backupUser: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  backupFileName: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  backupActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  backupActionButton: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  modalInfo: { gap: spacing.xs },
  modalInfoText: { fontSize: 14, color: colors.textSecondary },
  modalWarning: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: "500",
    textAlign: "center",
  },
  modalHint: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: { backgroundColor: colors.primary },
  modalButtonTextCancel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalButtonTextConfirm: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    textAlign: "center",
    backgroundColor: colors.background,
  },
});
}
