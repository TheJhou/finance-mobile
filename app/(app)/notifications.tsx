import { Button } from "@/components/ui/button";
import { extractTransactionFromText } from "@/lib/ai";
import { isAuthenticated, login, logout } from "@/lib/auth";
import { analyzeText, ocrDocument, transcribeAudio } from "@/lib/backend";
import { isNotificationProcessed, markNotificationAsProcessed } from "@/lib/db";
import {
    parseNotification,
    type ParsedTransaction,
} from "@/lib/notifications/parsers";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category } from "@/lib/types";
import { formatCurrency, toDateInputValue } from "@/lib/utils";
import BankNotifications, {
    type BankNotificationEvent,
} from "@/modules/bank-notifications";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

interface PendingItem extends ParsedTransaction {
  key: string;
  raw: string;
  postTime: number;
}

function normalizeType(type: unknown): "INCOME" | "EXPENSE" {
  if (typeof type === "string" && type.toUpperCase() === "INCOME") return "INCOME";
  return "EXPENSE";
}

export default function NotificationsScreen() {
  const [granted, setGranted] = useState(false);
  const [recentImports, setRecentImports] = useState<PendingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [processingText, setProcessingText] = useState(false);
  const [processingDocument, setProcessingDocument] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

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

  const checkAuth = useCallback(async () => {
    const authed = await isAuthenticated();
    setLoggedIn(authed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermission();
      loadCategories();
      checkAuth();
    }, [checkPermission, loadCategories, checkAuth])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

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
            status: "PAID",
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

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert("Erro", "Preencha e-mail e senha");
      return;
    }
    setLoggingIn(true);
    try {
      await login(loginEmail.trim(), loginPassword.trim());
      setLoggedIn(true);
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
      Alert.alert("Sucesso", "Login realizado!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao fazer login");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLoggedIn(false);
  };

  const handleProcessText = async () => {
    if (!freeText.trim()) return;
    if (!loggedIn) {
      Alert.alert("Login necessário", "Faça login para usar a IA.");
      return;
    }
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

      if (extracted.amount <= 0) {
        Alert.alert("Aviso", "Não foi possível identificar o valor. Revise a transação manualmente.");
        return;
      }

      await createTransaction({
        description: extracted.description,
        amount: extracted.amount,
        type: extracted.type,
        date: extracted.date,
        categoryId,
        notes: "Importado via texto livre",
        status: "PAID",
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
    if (!loggedIn) {
      Alert.alert("Login necessário", "Faça login para usar OCR.");
      return;
    }
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
        type: normalizeType(analysis.draft.type),
        date: analysis.draft.date,
        categoryId,
        notes: `Importado via documento: ${asset.name}`,
        status: "PENDING",
      });

      Alert.alert("Sucesso", "Transação criada automaticamente!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar documento");
    } finally {
      setProcessingDocument(false);
    }
  };

  const handleStartRecording = async () => {
    if (!loggedIn) {
      Alert.alert("Login necessário", "Faça login para usar transcrição de áudio.");
      return;
    }
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      recordingRef.current = recording;
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao gravar");
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    const currentRecording = recording;
    setRecording(null);
    try {
      setProcessingAudio(true);
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      if (!uri) throw new Error("Falha ao obter URI do áudio");

      const transcribedText = await transcribeAudio(uri, "audio/webm");
      const analysis = await analyzeText(transcribedText, "AUDIO", categories);
      const categoryId = analysis.draft.categoryId || selectedCategoryId;

      await createTransaction({
        description: analysis.draft.description,
        amount: analysis.draft.amount,
        type: normalizeType(analysis.draft.type),
        date: analysis.draft.date,
        categoryId,
        notes: "Importado via áudio",
        status: "PAID",
      });

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

        {!loggedIn && (
          <View
            style={[
              styles.permissionCard,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Ionicons name="log-in-outline" size={24} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permissionTitle}>Login necessário</Text>
              <Text style={styles.permissionText}>
                Faça login uma vez para usar IA, áudio, documentos e importações.
              </Text>
            </View>
            <Button
              title="Entrar"
              onPress={() => setShowLoginModal(true)}
              variant="secondary"
            />
          </View>
        )}

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

      <Modal visible={showLoginModal} animationType="slide" onRequestClose={() => setShowLoginModal(false)}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowLoginModal(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>Login</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalLabel}>E-mail</Text>
            <TextInput
              style={styles.modalInput}
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="seu@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text style={styles.modalLabel}>Senha</Text>
            <TextInput
              style={styles.modalInput}
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="Sua senha"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              Suas credenciais são usadas para autenticar com o servidor. A chave da IA fica protegida no backend.
            </Text>
            <Button title="Entrar" onPress={handleLogin} loading={loggingIn} />
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
