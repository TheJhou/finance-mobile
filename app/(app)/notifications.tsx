import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppState,
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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import BankNotifications, {
  type BankNotificationEvent,
} from "@/modules/bank-notifications";
import {
  parseNotification,
  type ParsedTransaction,
} from "@/lib/notifications/parsers";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { getStoredApiKey, setApiKey, extractTransactionFromText } from "@/lib/ai";
import { transcribeAudio, ocrDocument, analyzeText } from "@/lib/backend";
import { formatCurrency, toDateInputValue } from "@/lib/utils";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category } from "@/lib/types";
import { isNotificationProcessed, markNotificationAsProcessed } from "@/lib/db";

interface PendingItem extends ParsedTransaction {
  key: string;
  raw: string;
  postTime: number;
}

export default function NotificationsScreen() {
  const [granted, setGranted] = useState(false);
  const [recentImports, setRecentImports] = useState<PendingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKeyInput] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [processingText, setProcessingText] = useState(false);
  const [processingDocument, setProcessingDocument] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const moduleAvailable = BankNotifications != null;

  const checkPermission = useCallback(() => {
    try {
      setGranted(BankNotifications?.isPermissionGranted() ?? false);
    } catch {
      setGranted(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const cats = await listCategories();
    setCategories(cats);
    if (cats.length > 0) {
      setSelectedCategoryId((prev) => prev ?? cats[0].id);
    }
  }, []);

  const loadApiKey = useCallback(async () => {
    const key = await getStoredApiKey();
    if (key) setApiKeyInput(key);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermission();
      loadCategories();
      loadApiKey();
    }, [checkPermission, loadCategories, loadApiKey])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!BankNotifications) return;
    const sub = BankNotifications.addListener(
      "onNotification",
      async (event: BankNotificationEvent) => {
        const parsed = parseNotification(event);
        if (!parsed) return;

        // Verificar deduplicação persistente no banco
        const text = [event.title, event.text, event.bigText].filter(Boolean).join(" ");
        const alreadyProcessed = await isNotificationProcessed(
          event.packageName,
          event.title,
          text,
          parsed.amount,
          event.postTime
        );
        
        if (alreadyProcessed) {
          console.log("[Notifications] Notificação duplicada ignorada:", {
            packageName: event.packageName,
            title: event.title,
            amount: parsed.amount,
          });
          return;
        }

        // Auto-import directly
        if (!selectedCategoryId) {
          Alert.alert("Erro", "Configure uma categoria padrão para importar automaticamente.");
          return;
        }
        try {
          await createTransaction({
            description: parsed.description,
            amount: parsed.amount,
            type: parsed.type,
            paymentMethod: parsed.paymentMethod,
            date: toDateInputValue(new Date(event.postTime)),
            categoryId: selectedCategoryId,
            notes: `Importado de ${parsed.bank}`,
            status: parsed.amount >= 500 ? "PENDING" : "PAID",
          });

          // Marcar como processado no banco
          await markNotificationAsProcessed(
            event.packageName,
            event.title,
            text,
            parsed.amount,
            event.postTime
          );

          // Add to recent imports log
          const key = `${event.packageName}|${event.postTime}|${parsed.amount}|${parsed.description}`;
          setRecentImports((prev: PendingItem[]) => [
            {
              ...parsed,
              key,
              raw: [event.title, event.bigText ?? event.text]
                .filter(Boolean)
                .join(" — "),
              postTime: event.postTime,
            },
            ...prev,
          ].slice(0, 10)); // Keep only last 10
        } catch (err) {
          Alert.alert("Erro ao importar", err instanceof Error ? err.message : "Falha");
        }
      }
    );
    return () => {
      sub.remove();
    };
  }, [selectedCategoryId]);

  const openSettings = () => {
    try {
      BankNotifications?.openPermissionSettings();
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao abrir"
      );
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert("Erro", "Informe a API Key");
      return;
    }
    setSavingApiKey(true);
    try {
      await setApiKey(apiKey.trim());
      setShowApiKeyModal(false);
      Alert.alert("Sucesso", "API Key configurada!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleProcessText = async () => {
    if (!freeText.trim()) return;
    if (!selectedCategoryId) {
      Alert.alert("Erro", "Configure uma categoria padrão primeiro.");
      return;
    }
    setProcessingText(true);
    try {
      const extracted = await extractTransactionFromText(freeText);
      const categoryId = extracted.categoryName
        ? categories.find((c) => c.name.toLowerCase() === extracted.categoryName!.toLowerCase())?.id ?? selectedCategoryId
        : selectedCategoryId;

      await createTransaction({
        description: extracted.description,
        amount: extracted.amount,
        type: extracted.type,
        date: extracted.date,
        categoryId,
        notes: "Importado via texto livre",
        status: extracted.amount >= 500 ? "PENDING" : "PAID",
      });

      setFreeText("");
      Alert.alert("Sucesso", "Transação criada automaticamente!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar");
    } finally {
      setProcessingText(false);
    }
  };

  const handlePickDocument = async () => {
    if (!selectedCategoryId) {
      Alert.alert("Erro", "Configure uma categoria padrão primeiro.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg", "image/jpg"],
      });

      if (result.canceled || !result.assets[0]) return;

      setProcessingDocument(true);
      const asset = result.assets[0];
      const extractedText = await ocrDocument(asset.uri, asset.mimeType || "application/pdf");

      const analysis = await analyzeText(extractedText, "DOCUMENT", categories);
      const categoryId = analysis.draft.categoryId || selectedCategoryId;

      await createTransaction({
        description: analysis.draft.description,
        amount: analysis.draft.amount,
        type: analysis.draft.type,
        date: analysis.draft.date,
        categoryId,
        notes: `Importado via documento: ${asset.name}`,
        status: analysis.draft.amount >= 500 ? "PENDING" : "PAID",
      });

      Alert.alert("Sucesso", "Transação criada automaticamente!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar documento");
    } finally {
      setProcessingDocument(false);
    }
  };

  const handleStartRecording = async () => {
    if (!selectedCategoryId) {
      Alert.alert("Erro", "Configure uma categoria padrão primeiro.");
      return;
    }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Erro", "Permissão de microfone negada");
        return;
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      setRecording(recording);
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao gravar");
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    try {
      setProcessingAudio(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("Falha ao obter URI do áudio");

      const transcribedText = await transcribeAudio(uri, "audio/webm");
      const analysis = await analyzeText(transcribedText, "AUDIO", categories);
      const categoryId = analysis.draft.categoryId || selectedCategoryId;

      await createTransaction({
        description: analysis.draft.description,
        amount: analysis.draft.amount,
        type: analysis.draft.type,
        date: analysis.draft.date,
        categoryId,
        notes: "Importado via áudio",
        status: analysis.draft.amount >= 500 ? "PENDING" : "PAID",
      });

      setRecording(null);
      Alert.alert("Sucesso", "Transação criada automaticamente!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar áudio");
    } finally {
      setProcessingAudio(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Importar</Text>
        <Text style={styles.subtitle}>
          Capture notificações de bancos automaticamente
        </Text>
      </View>

      {!moduleAvailable && (
        <View style={[styles.permissionCard, { borderColor: colors.danger, backgroundColor: "#fee2e2" }]}>
          <Ionicons name="warning" size={24} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.permissionTitle}>Módulo nativo indisponível</Text>
            <Text style={styles.permissionText}>
              Esta funcionalidade requer o APK nativo. No Expo Go apenas as outras abas funcionam.
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.permissionCard,
            {
              borderColor: granted ? colors.incomeFg : colors.warning,
              backgroundColor: granted ? colors.incomeBg : "#fef3c7",
            },
          ]}
        >
          <Ionicons
            name={granted ? "checkmark-circle" : "alert-circle"}
            size={24}
            color={granted ? colors.incomeFg : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.permissionTitle}>
              {granted ? "Acesso liberado" : "Precisa autorizar"}
            </Text>
            <Text style={styles.permissionText}>
              {granted
                ? "O app está capturando suas notificações bancárias."
                : "Abra as configurações do Android e dê acesso ao Finance App na lista de leitores de notificação."}
            </Text>
          </View>
          {!granted && (
            <Button title="Abrir" onPress={openSettings} variant="secondary" />
          )}
        </View>

        <View
          style={[
            styles.permissionCard,
            {
              borderColor: apiKey ? colors.incomeFg : colors.border,
              backgroundColor: apiKey ? colors.incomeBg : colors.surface,
            },
          ]}
        >
          <Ionicons
            name="key-outline"
            size={24}
            color={apiKey ? colors.incomeFg : colors.textSecondary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.permissionTitle}>
              {apiKey ? "API Key configurada" : "API Key da OpenAI"}
            </Text>
            <Text style={styles.permissionText}>
              {apiKey
                ? "A IA está pronta para escanear recibos."
                : "Configure sua API Key da OpenAI para usar o escaneamento de recibos por foto."}
            </Text>
          </View>
          <Button
            title={apiKey ? "Alterar" : "Configurar"}
            onPress={() => setShowApiKeyModal(true)}
            variant="secondary"
          />
        </View>

        {categories.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionLabel}>Categoria padrão ao importar</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {categories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSelectedCategoryId(cat.id)}
                    style={[
                      styles.pill,
                      active && { backgroundColor: cat.color, borderColor: cat.color },
                    ]}
                  >
                    <View
                      style={[styles.pillDot, { backgroundColor: cat.color }]}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        active && { color: colors.textInverse },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionLabel}>Texto livre</Text>
          <TextInput
            style={styles.freeTextInput}
            value={freeText}
            onChangeText={setFreeText}
            placeholder="Ex: Gastei R$ 50 no McDonalds hoje com cartão de crédito"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
          <Button
            title={processingText ? "Processando..." : "Processar com IA"}
            onPress={handleProcessText}
            loading={processingText}
            disabled={!freeText.trim() || processingText}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionLabel}>Documento (PDF, Imagem)</Text>
          <Button
            title={processingDocument ? "Processando..." : "Selecionar documento"}
            onPress={handlePickDocument}
            loading={processingDocument}
            disabled={processingDocument}
            variant="secondary"
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionLabel}>Gravar áudio</Text>
          <Button
            title={recording ? "Parar gravação" : "Gravar"}
            onPress={recording ? handleStopRecording : handleStartRecording}
            loading={processingAudio}
            disabled={processingAudio}
            variant={recording ? "secondary" : undefined}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionLabel}>
            Importações recentes ({recentImports.length})
          </Text>
          {recentImports.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="notifications-off-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>Nenhuma importação recente</Text>
              <Text style={styles.emptyHint}>
                As notificações bancárias serão importadas automaticamente.
              </Text>
            </View>
          ) : (
            <FlatList
              data={recentImports}
              keyExtractor={(item) => item.key}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing.sm }} />
              )}
              renderItem={({ item }) => {
                const isIncome = item.type === "INCOME";
                return (
                  <View style={[styles.card, { opacity: 0.7 }]}>
                    <View style={styles.cardHeader}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isIncome
                              ? colors.incomeBg
                              : colors.expenseBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: isIncome
                                ? colors.incomeFg
                                : colors.expenseFg,
                            },
                          ]}
                        >
                          {isIncome ? "Receita" : "Despesa"} · {item.bank}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.cardAmount,
                          {
                            color: isIncome ? colors.incomeFg : colors.expenseFg,
                          },
                        ]}
                      >
                        {formatCurrency(item.amount)}
                      </Text>
                    </View>
                    <Text style={styles.cardDesc}>{item.description}</Text>
                    <View style={styles.importedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.incomeFg} />
                      <Text style={styles.importedText}>Importado automaticamente</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      <Modal visible={showApiKeyModal} animationType="slide" onRequestClose={() => setShowApiKeyModal(false)}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowApiKeyModal(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Configurar API Key</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalLabel}>OpenAI API Key</Text>
            <TextInput
              style={styles.modalInput}
              value={apiKey}
              onChangeText={setApiKeyInput}
              placeholder="sk-..."
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              Sua API Key é usada para processar fotos de recibos. Ela é armazenada localmente no seu dispositivo.
            </Text>
            <Button title="Salvar" onPress={handleSaveApiKey} loading={savingApiKey} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  permissionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  permissionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  permissionText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },

  pillRow: { gap: spacing.sm, paddingVertical: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontSize: 13, color: colors.textPrimary, fontWeight: "500" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  emptyHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },

  card: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardAmount: { fontSize: 18, fontWeight: "700" },
  cardDesc: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  importedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
  },
  importedText: { fontSize: 11, color: colors.incomeFg, fontWeight: "500" },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  modalContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  modalLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  modalHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  freeTextInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
