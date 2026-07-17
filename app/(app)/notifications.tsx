import { Button } from "@/components/ui/button";
import { isAuthenticated, login, register } from "@/lib/auth";
import { ApiError, analyzeText, ocrDocument, transcribeAudio } from "@/lib/backend";
import {
    getPendingApprovalNotifications,
    markApproved,
    markRejected,
    type NotificationQueueItem,
} from "@/lib/notification-queue";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { checkProFeature } from "@/lib/subscription";
import { enqueueSync, processSyncQueue, type SyncPayload } from "@/lib/sync-queue";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Category, DocumentType, TransactionStatus } from "@/lib/types";
import { formatCurrency, normalizePaymentMethod, toDateInputValue } from "@/lib/utils";
import BankNotifications from "@/modules/bank-notifications";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function normalizeType(type: unknown): "INCOME" | "EXPENSE" {
  if (typeof type === "string" && type.toUpperCase() === "INCOME") return "INCOME";
  return "EXPENSE";
}

function normalizeDocumentType(value: unknown): DocumentType {
  const allowed: DocumentType[] = ["NORMAL", "BOLETO", "NOTA_FISCAL", "COMPROVANTE_PIX", "COMPROVANTE_BANCARIO", "OUTRO"];
  return typeof value === "string" && allowed.includes(value as DocumentType) ? (value as DocumentType) : "NORMAL";
}

function normalizeStatus(value: unknown, fallback: TransactionStatus): TransactionStatus {
  const allowed: TransactionStatus[] = ["PAID", "PENDING", "OVERDUE"];
  return typeof value === "string" && allowed.includes(value as TransactionStatus) ? (value as TransactionStatus) : fallback;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [granted, setGranted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<NotificationQueueItem[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPasswordConfirm, setLoginPasswordConfirm] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [processingText, setProcessingText] = useState(false);
  const [processingDocument, setProcessingDocument] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: "success" | "error" | "warning", message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ type, message });
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const moduleAvailable = BankNotifications != null;

  const checkPermission = useCallback(() => {
    try {
      if (!BankNotifications) {
        setGranted(false);
        setConnected(false);
        return;
      }
      
      // Add a small delay to ensure the permission system is ready
      const timeoutId = setTimeout(() => {
        const isGranted = BankNotifications?.isPermissionGranted() ?? false;
        const isConnected = BankNotifications?.isListenerConnected() ?? false;
        console.log("[Notifications] Permission:", isGranted, "Connected:", isConnected);
        setGranted(isGranted);
        setConnected(isConnected);
      }, 100);
      return () => clearTimeout(timeoutId);
    } catch (error) {
      console.warn("[Notifications] Error checking permission:", error);
      setGranted(false);
      setConnected(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const cats = await listCategories();
    setCategories(cats);
  }, []);

  const loadPending = useCallback(async () => {
    const items = await getPendingApprovalNotifications();
    setPendingNotifications(items);
  }, []);

  const checkAuth = useCallback(async () => {
    const authed = await isAuthenticated();
    setLoggedIn(authed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermission();
      loadCategories();
      loadPending();
      checkAuth();
    }, [checkPermission, loadCategories, loadPending, checkAuth])
  );

  const handleApprove = useCallback(async (item: NotificationQueueItem) => {
    setApprovingId(item.id);
    try {
      const txData = {
        description: item.description || "Transação",
        amount: item.amount || 0,
        type: (item.type || "EXPENSE") as "INCOME" | "EXPENSE",
        paymentMethod: (item.paymentMethod || "OTHER") as any,
        date: toDateInputValue(new Date(item.postTime)),
        categoryId: item.categoryId || "",
        notes: `Auto-importado de ${item.bank || "Banco"}`,
        status: 'PAID' as TransactionStatus,
        source: "BANK_NOTIFICATION" as const,
        bankOrigin: item.bank || null,
      };

      const created = await createTransaction(txData);

      await markApproved(item.id);
      await loadPending();
      showToast('success', `Transação aprovada: ${item.description}`);

      const syncPayload: SyncPayload = {
        description: txData.description,
        amount: txData.amount,
        type: txData.type,
        paymentMethod: txData.paymentMethod,
        date: txData.date,
        categoryId: txData.categoryId || undefined,
        notes: txData.notes,
        source: "BANK_NOTIFICATION",
      };
      await enqueueSync(created.id, syncPayload);
      void processSyncQueue();
    } catch {
      showToast('error', 'Falha ao salvar transação');
    } finally {
      setApprovingId(null);
    }
  }, [loadPending, showToast]);

  const handleReject = useCallback(async (id: string) => {
    await markRejected(id);
    await loadPending();
    showToast('warning', 'Notificação descartada');
  }, [loadPending, showToast]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkPermission();
      }
    });
    return () => sub.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!moduleAvailable) return;
    const interval = setInterval(() => {
      if (BankNotifications) {
        const isConnected = BankNotifications.isListenerConnected();
        setConnected(isConnected);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [moduleAvailable]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    return () => {
      if (recordingRef.current && audioRecorder.isRecording) {
        audioRecorder.stop().catch(() => {});
      }
    };
  }, [audioRecorder]);

  // Listener de notificações agora é global (useNotificationListener no _layout.tsx)

  const openSettings = () => {
    try {
      if (!BankNotifications) {
        showToast("error", "Módulo de notificações não disponível");
        return;
      }
      
      BankNotifications?.openPermissionSettings();
      showToast("warning", "Abra as configurações e ative 'Kilun'");
      
      // Check permission again after a delay to see if user enabled it
      const settingsTimeout = setTimeout(() => {
        checkPermission();
      }, 2000);
    } catch (err) {
      console.error("[Notifications] Error opening settings:", err);
      showToast("error", "Falha ao abrir configurações. Abra manualmente em Configurações > Aplicativos > Kilun > Notificações");
    }
  };

  const resetAuthForm = () => {
    setLoginName("");
    setLoginEmail("");
    setLoginPassword("");
    setLoginPasswordConfirm("");
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast("error", "Preencha e-mail e senha");
      return;
    }
    setLoggingIn(true);
    try {
      await login(loginEmail.trim(), loginPassword.trim());
      setLoggedIn(true);
      setShowLoginModal(false);
      resetAuthForm();
      showToast("success", "Login realizado com sucesso!");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Falha ao fazer login");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast("error", "Preencha e-mail e senha");
      return;
    }
    if (loginPassword.length < 6) {
      showToast("error", "A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (loginPassword !== loginPasswordConfirm) {
      showToast("error", "As senhas não coincidem");
      return;
    }
    setLoggingIn(true);
    try {
      await register(loginName.trim() || "Usuário", loginEmail.trim(), loginPassword);
      setLoggedIn(true);
      setShowLoginModal(false);
      resetAuthForm();
      showToast("success", "Conta criada com sucesso!");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Falha ao criar conta");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleProcessText = async () => {
    if (!freeText.trim()) return;
    if (!loggedIn) {
      showToast("warning", "Faça login para usar a IA.");
      return;
    }
    setProcessingText(true);
    try {
      const result = await analyzeText(
        freeText,
        "TEXT",
        categories.map((c) => ({ id: c.id, name: c.name }))
      );
      const draft = result.draft;

      if (!draft || draft.amount <= 0) {
        showToast("warning", "Não foi possível identificar o valor. Revise manualmente.");
        return;
      }

      const isPending = draft.status === "PENDING";

      // Valida data da IA: se ausente ou fora de ±6 meses, usa hoje
      const today = toDateInputValue(new Date());
      let resolvedDate = draft.date || today;
      const parsedDate = new Date(resolvedDate + "T00:00:00");
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const sixMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 6, 1);
      if (isNaN(parsedDate.getTime()) || parsedDate < sixMonthsAgo || parsedDate > sixMonthsAhead) {
        resolvedDate = today;
      }

      await createTransaction({
        description: draft.description || freeText.substring(0, 50),
        amount: draft.amount,
        type: draft.type || "EXPENSE",
        paymentMethod: normalizePaymentMethod(draft.paymentMethod, "OTHER"),
        date: resolvedDate,
        categoryId: draft.categoryId || "",
        documentType: normalizeDocumentType(draft.documentType),
        boletoNumber: draft.boletoNumber || null,
        cnpj: draft.cnpj || null,
        recipientName: draft.recipientName || null,
        notes: isPending ? "Importado via texto (pendente de confirmação)" : "Importado via texto livre",
        status: normalizeStatus(draft.status, "PAID"),
        source: "IMPORT",
      });

      setFreeText("");
      if (isPending) {
        showToast("warning", "Salvo como pendente. Revise o tipo na aba Transações.");
      } else {
        showToast("success", "Transação criada automaticamente!");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        showToast("error", "Limite de tokens atingido. Veja seu Plano.");
      } else {
        showToast("error", err instanceof Error ? err.message : "Falha ao processar");
      }
    } finally {
      setProcessingText(false);
    }
  };

  const handlePickDocument = async () => {
    if (!loggedIn) {
      showToast("warning", "Faça login para usar OCR.");
      return;
    }
    const isPro = await checkProFeature("OCR");
    if (!isPro) {
      showToast("warning", "OCR de documentos é exclusivo do plano Pro. Faça upgrade na aba Meu Plano.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg", "image/jpg"],
      });

      if (result.canceled || !result.assets[0]) return;

      setProcessingDocument(true);
      const asset = result.assets[0];
      const ocrResult = await ocrDocument(
        asset.uri,
        asset.mimeType || "application/pdf",
        categories.map((c) => ({ id: c.id, name: c.name }))
      );

      const draft = ocrResult.draft;
      if (!draft || !draft.amount || Number(draft.amount) <= 0) {
        showToast("warning", "Não foi possível identificar o valor no documento. Revise manualmente.");
        return;
      }

      const ocrToday = toDateInputValue(new Date());
      let ocrDate = (draft.date as string) || ocrToday;
      const ocrParsed = new Date(ocrDate + "T00:00:00");
      const ocrNow = new Date();
      if (isNaN(ocrParsed.getTime()) || ocrParsed < new Date(ocrNow.getFullYear(), ocrNow.getMonth() - 6, 1) || ocrParsed > new Date(ocrNow.getFullYear(), ocrNow.getMonth() + 6, 1)) {
        ocrDate = ocrToday;
      }
      await createTransaction({
        description: (draft.description as string) || `Documento: ${asset.name}`,
        amount: Number(draft.amount),
        type: normalizeType(draft.type),
        paymentMethod: normalizePaymentMethod(draft.paymentMethod, "OTHER"),
        date: ocrDate,
        categoryId: (draft.categoryId as string) || "",
        documentType: normalizeDocumentType(draft.documentType),
        boletoNumber: (draft.boletoNumber as string) || null,
        cnpj: (draft.cnpj as string) || null,
        recipientName: (draft.recipientName as string) || null,
        notes: `Importado via documento: ${asset.name}`,
        status: normalizeStatus(draft.status, "PENDING"),
        source: "IMPORT",
      });

      showToast("success", "Transação criada automaticamente!");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        showToast("error", "Limite de tokens atingido. Veja seu Plano.");
      } else {
        showToast("error", err instanceof Error ? err.message : "Falha ao processar documento");
      }
    } finally {
      setProcessingDocument(false);
    }
  };

  const handleStartRecording = async () => {
    if (!loggedIn) {
      showToast("warning", "Faça login para usar transcrição de áudio.");
      return;
    }
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        showToast("error", "Permissão de microfone negada");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
      recordingRef.current = true;
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Falha ao iniciar gravação");
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    setRecording(false);
    recordingRef.current = false;
    try {
      setProcessingAudio(true);
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("Falha ao obter URI do áudio");

      const transcribedText = await transcribeAudio(uri, "audio/webm");
      const analysis = await analyzeText(transcribedText, "AUDIO", categories.map((c) => ({ id: c.id, name: c.name })));
      const draft = analysis.draft;
      if (!draft || !draft.amount || Number(draft.amount) <= 0) {
        showToast("warning", "Não foi possível identificar o valor no áudio. Revise manualmente.");
        return;
      }
      const audioToday = toDateInputValue(new Date());
      let audioDate = draft.date || audioToday;
      const audioParsed = new Date(audioDate + "T00:00:00");
      const audioNow = new Date();
      if (isNaN(audioParsed.getTime()) || audioParsed < new Date(audioNow.getFullYear(), audioNow.getMonth() - 6, 1) || audioParsed > new Date(audioNow.getFullYear(), audioNow.getMonth() + 6, 1)) {
        audioDate = audioToday;
      }
      await createTransaction({
        description: draft.description || transcribedText.substring(0, 50),
        amount: Number(draft.amount),
        type: normalizeType(draft.type),
        paymentMethod: normalizePaymentMethod(draft.paymentMethod, "OTHER"),
        date: audioDate,
        categoryId: draft.categoryId || "",
        documentType: normalizeDocumentType(draft.documentType),
        boletoNumber: draft.boletoNumber || null,
        cnpj: draft.cnpj || null,
        recipientName: draft.recipientName || null,
        notes: "Importado via áudio",
        status: normalizeStatus(draft.status, "PAID"),
        source: "IMPORT",
      });

      showToast("success", "Transação criada automaticamente!");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        showToast("error", "Limite de tokens atingido. Veja seu Plano.");
      } else {
        showToast("error", err instanceof Error ? err.message : "Falha ao processar áudio");
      }
    } finally {
      setProcessingAudio(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Importar</Text>
          <Text style={styles.subtitle}>Adicione transações de forma inteligente</Text>
        </View>
        {loggedIn ? (
          <View style={styles.authChip}>
            <View style={styles.authDot} />
            <Text style={styles.authChipText}>Conectado</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.authChip, { borderColor: colors.warning }]}
            onPress={() => setShowLoginModal(true)}
          >
            <Ionicons name="log-in-outline" size={14} color={colors.warning} />
            <Text style={[styles.authChipText, { color: colors.warning }]}>Entrar</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status cards */}
        {!moduleAvailable && (
          <View style={[styles.statusCard, { borderColor: colors.danger }]}>
            <Ionicons name="warning" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Módulo nativo indisponível</Text>
              <Text style={styles.statusText}>
                Requer APK nativo. No Expo Go apenas as outras abas funcionam.
              </Text>
            </View>
          </View>
        )}

        <View
          style={[
            styles.statusCard,
            { borderColor: granted ? colors.success : colors.warning },
          ]}
        >
          <Ionicons
            name={granted ? "checkmark-circle" : "alert-circle"}
            size={20}
            color={granted ? colors.success : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {granted ? "Notificações ativas" : "Notificações desativadas"}
            </Text>
            <Text style={styles.statusText}>
              {granted
                ? "Capturando notificações bancárias automaticamente."
                : moduleAvailable 
                  ? "Autorize o acesso nas configurações do Android para importar automaticamente."
                  : "Módulo não disponível. Requer build nativo."}
            </Text>
            {!granted && moduleAvailable && (
              <Text style={styles.statusSubText}>
                Dica: Após ativar, pode ser necessário reiniciar o app
              </Text>
            )}
          </View>
          {!granted && moduleAvailable && (
            <Pressable style={styles.statusBtn} onPress={openSettings}>
              <Text style={styles.statusBtnText}>Ativar</Text>
            </Pressable>
          )}
        </View>

        {granted && connected && moduleAvailable && BankNotifications && !BankNotifications.isBatteryOptimizationIgnored() && (
          <View style={[styles.statusCard, { borderColor: colors.warning }]}>
            <Ionicons name="battery-charging-outline" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Otimização de bateria ativa</Text>
              <Text style={styles.statusText}>
                O Android pode encerrar o serviço em segundo plano. Desative a otimização para manter a captura estável.
              </Text>
            </View>
            <Pressable
              style={[styles.statusBtn, { backgroundColor: colors.warning }]}
              onPress={() => {
                try {
                  BankNotifications?.requestIgnoreBatteryOptimizations();
                } catch {
                  showToast("error", "Falha ao solicitar isenção de bateria");
                }
              }}
            >
              <Text style={styles.statusBtnText}>Isentar</Text>
            </Pressable>
          </View>
        )}

        {granted && !connected && moduleAvailable && (
          <View style={[styles.statusCard, { borderColor: colors.danger }]}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Listener desconectado</Text>
              <Text style={styles.statusText}>
                O serviço de captura foi interrompido pelo Android. Tente reativar
                abaixo ou desative e reative o acesso nas configurações.
              </Text>
            </View>
            <Pressable
              style={[styles.statusBtn, { backgroundColor: colors.primary }]}
              onPress={async () => {
                try {
                  BankNotifications?.requestRebind();
                  showToast("success", "Tentando reconectar...");
                  let reconnected = false;
                  for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    const isGranted = BankNotifications?.isPermissionGranted() ?? false;
                    const isConnected = BankNotifications?.isListenerConnected() ?? false;
                    setGranted(isGranted);
                    setConnected(isConnected);
                    if (isConnected) {
                      reconnected = true;
                      showToast("success", "Listener reconectado com sucesso!");
                      break;
                    }
                    if (i < 2) {
                      BankNotifications?.requestRebind();
                    }
                  }
                  if (!reconnected) {
                    showToast("warning", "Não foi possível reconectar. Tente nas configurações do Android.");
                  }
                } catch {
                  showToast("error", "Falha ao reativar listener");
                }
              }}
            >
              <Text style={styles.statusBtnText}>Reativar</Text>
            </Pressable>
            <Pressable style={styles.statusBtn} onPress={openSettings}>
              <Text style={styles.statusBtnText}>Config</Text>
            </Pressable>
          </View>
        )}

        {/* Import methods */}
        <Text style={styles.sectionTitle}>Métodos de importação</Text>
        <View style={styles.methodsGrid}>
          {/* Text */}
          <Pressable
            style={({ pressed }) => [
              styles.methodCard,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {}}
            disabled
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.methodIconWrap}
            >
              <Ionicons name="text-outline" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.methodTitle}>Texto</Text>
            <Text style={styles.methodDesc}>Descreva com palavras</Text>
          </Pressable>

          {/* Document */}
          <Pressable
            style={({ pressed }) => [
              styles.methodCard,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handlePickDocument}
            disabled={processingDocument}
          >
            <LinearGradient
              colors={["#60a5fa", "#2563eb"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.methodIconWrap}
            >
              {processingDocument ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="document-text-outline" size={22} color="#fff" />
              )}
            </LinearGradient>
            <Text style={styles.methodTitle}>Documento</Text>
            <Text style={styles.methodDesc}>PDF ou imagem</Text>
          </Pressable>

          {/* Audio */}
          <Pressable
            style={({ pressed }) => [
              styles.methodCard,
              pressed && { opacity: 0.8 },
              !loggedIn && { opacity: 0.4 },
            ]}
            onPress={recording ? handleStopRecording : handleStartRecording}
            disabled={processingAudio}
          >
            <LinearGradient
              colors={recording ? ["#f87171", "#dc2626"] : ["#34d399", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.methodIconWrap}
            >
              {processingAudio ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons
                  name={recording ? "stop" : "mic-outline"}
                  size={22}
                  color="#fff"
                />
              )}
            </LinearGradient>
            <Text style={styles.methodTitle}>
              {recording ? "Parar" : "Áudio"}
            </Text>
            <Text style={styles.methodDesc}>
              {processingAudio ? "Processando..." : recording ? "Gravando..." : "Fale a transação"}
            </Text>
          </Pressable>
        </View>

        {/* Free text area */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>Texto livre com IA</Text>
          </View>
          <TextInput
            style={styles.freeTextInput}
            value={freeText}
            onChangeText={setFreeText}
            placeholder="Ex: Gastei R$ 50 no McDonalds hoje com cartão de crédito"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
          <Pressable
            style={[
              styles.processBtn,
              (!freeText.trim() || processingText) && { opacity: 0.4 },
            ]}
            onPress={handleProcessText}
            disabled={!freeText.trim() || processingText}
          >
            {processingText ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={18} color="#fff" />
                <Text style={styles.processBtnText}>Processar com IA</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Pending bank notifications awaiting approval */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>
              Notificações pendentes ({pendingNotifications.length})
            </Text>
          </View>
          {pendingNotifications.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-download-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma notificação pendente</Text>
              <Text style={styles.emptyHint}>
                Notificações bancárias capturadas aparecerão aqui para aprovação.
              </Text>
            </View>
          ) : (
            <FlatList
              data={pendingNotifications}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing.sm }} />
              )}
              renderItem={({ item }) => {
                const isIncome = item.type === "INCOME";
                const isApproving = approvingId === item.id;
                return (
                  <View style={styles.importCard}>
                    <View style={styles.importCardHeader}>
                      <View style={[styles.importBadge, { backgroundColor: isIncome ? colors.incomeBg : colors.expenseBg }]}>
                        <Ionicons name={isIncome ? "arrow-up" : "arrow-down"} size={12} color={isIncome ? colors.incomeFg : colors.expenseFg} />
                        <Text style={[styles.importBadgeText, { color: isIncome ? colors.incomeFg : colors.expenseFg }]}>
                          {item.bank || "Banco"}
                        </Text>
                      </View>
                      <Text style={[styles.importAmount, { color: isIncome ? colors.incomeFg : colors.expenseFg }]}>
                        {isIncome ? "+" : "-"}{formatCurrency(item.amount || 0)}
                      </Text>
                    </View>
                    <Text style={styles.importDesc} numberOfLines={2}>{item.description || "Transação"}</Text>
                    <Text style={styles.importCategory}>{item.categoryName || "Outros"}</Text>
                    <View style={styles.importActions}>
                      <Pressable
                        style={[styles.importActionBtn, styles.importApproveBtn]}
                        onPress={() => handleApprove(item)}
                        disabled={isApproving}
                      >
                        {isApproving
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Ionicons name="checkmark" size={14} color="#fff" />}
                        <Text style={styles.importActionText}>Aprovar</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.importActionBtn, styles.importRejectBtn]}
                        onPress={() => handleReject(item.id)}
                        disabled={isApproving}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={styles.importActionText}>Descartar</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* Toast feedback */}
      {toast && (
        <View style={[styles.toast, toast.type === "success" ? styles.toastSuccess : toast.type === "error" ? styles.toastError : styles.toastWarning]} pointerEvents="none">
          <Ionicons
            name={toast.type === "success" ? "checkmark-circle" : toast.type === "error" ? "close-circle" : "warning"}
            size={20}
            color="#fff"
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Auth modal */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowLoginModal(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {authMode === "login" ? "Entrar" : "Criar conta"}
            </Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tab switcher */}
            <View style={styles.authTabs}>
              <Pressable
                style={[
                  styles.authTab,
                  authMode === "login" && styles.authTabActive,
                ]}
                onPress={() => setAuthMode("login")}
              >
                <Text
                  style={[
                    styles.authTabText,
                    authMode === "login" && styles.authTabTextActive,
                  ]}
                >
                  Entrar
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.authTab,
                  authMode === "register" && styles.authTabActive,
                ]}
                onPress={() => setAuthMode("register")}
              >
                <Text
                  style={[
                    styles.authTabText,
                    authMode === "register" && styles.authTabTextActive,
                  ]}
                >
                  Registrar
                </Text>
              </Pressable>
            </View>

            <View style={styles.modalIconWrap}>
              <Ionicons
                name={authMode === "login" ? "shield-checkmark" : "person-add"}
                size={40}
                color={colors.primary}
              />
            </View>
            <Text style={styles.modalHint}>
              {authMode === "login"
                ? "Entre com suas credenciais para usar IA e importações."
                : "Crie uma conta gratuita para começar a usar."}
            </Text>

            {authMode === "register" && (
              <View style={{ gap: 6 }}>
                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput
                  style={styles.modalInput}
                  value={loginName}
                  onChangeText={setLoginName}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={styles.modalLabel}>E-mail</Text>
              <TextInput
                style={styles.modalInput}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="seu@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.modalLabel}>Senha</Text>
              <TextInput
                style={styles.modalInput}
                value={loginPassword}
                onChangeText={setLoginPassword}
                placeholder={authMode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {authMode === "register" && (
              <View style={{ gap: 6 }}>
                <Text style={styles.modalLabel}>Confirmar senha</Text>
                <TextInput
                  style={styles.modalInput}
                  value={loginPasswordConfirm}
                  onChangeText={setLoginPasswordConfirm}
                  placeholder="Repita a senha"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            <Button
              title={authMode === "login" ? "Entrar" : "Criar conta"}
              onPress={authMode === "login" ? handleLogin : handleRegister}
              loading={loggingIn}
            />

            {authMode === "login" && (
              <Pressable
                style={{ alignItems: "center", paddingVertical: spacing.xs }}
                onPress={() => {
                  setShowLoginModal(false);
                  router.push("/forgot-password" as any);
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                  Esqueci minha senha
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.switchAuthBtn}
              onPress={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                resetAuthForm();
              }}
            >
              <Text style={styles.switchAuthText}>
                {authMode === "login"
                  ? "Não tem conta? Registre-se"
                  : "Já tem conta? Entrar"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  authChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  authDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  authChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },

  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  statusTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  statusText: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  statusSubText: { fontSize: 10, color: colors.textMuted, marginTop: 4, fontStyle: "italic" },
  statusBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.warning,
  },
  statusBtnText: { fontSize: 12, fontWeight: "700", color: "#1a1a1a" },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },

  methodsGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  methodCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    gap: 8,
  },
  methodIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  methodDesc: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },

  freeTextInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    minHeight: 80,
    textAlignVertical: "top",
  },
  processBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  processBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

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
    backgroundColor: colors.surfaceElevated,
  },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  emptyHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },

  importCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    gap: 6,
  },
  importCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  importBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  importBadgeText: { fontSize: 11, fontWeight: "600" },
  importAmount: { fontSize: 16, fontWeight: "800" },
  importDesc: { fontSize: 13, color: colors.textSecondary },
  importCategory: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 1 },
  importActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  importActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: radius.sm,
    gap: 4,
  },
  importApproveBtn: { backgroundColor: colors.success },
  importRejectBtn: { backgroundColor: colors.danger },
  importActionText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  importFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  importFooterText: { fontSize: 10, color: colors.textMuted },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  modalContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
  modalIconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  modalLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  modalHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },

  authTabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: 3,
  },
  authTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md - 2,
    alignItems: "center",
  },
  authTabActive: {
    backgroundColor: colors.primary,
  },
  authTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  authTabTextActive: {
    color: "#fff",
  },
  switchAuthBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  switchAuthText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },

  toast: {
    position: "absolute",
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 999,
  },
  toastSuccess: { backgroundColor: colors.success },
  toastError: { backgroundColor: colors.danger },
  toastWarning: { backgroundColor: colors.warning },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    lineHeight: 18,
  },
  });
}
