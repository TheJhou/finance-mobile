import { Button } from "@/components/ui/button";
import { isAuthenticated, login, logout, register } from "@/lib/auth";
import { ApiError, analyzeText, ocrDocument, transcribeAudio } from "@/lib/backend";
import {
    type ParsedTransaction
} from "@/lib/notifications/parsers";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction } from "@/lib/repositories/transactions";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category } from "@/lib/types";
import { formatCurrency, toDateInputValue } from "@/lib/utils";
import BankNotifications from "@/modules/bank-notifications";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
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
  const [recentImports] = useState<PendingItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [showLoginModal, setShowLoginModal] = useState(false);
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

  // Listener de notificações agora é global (useNotificationListener no _layout.tsx)

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

  const resetAuthForm = () => {
    setLoginName("");
    setLoginEmail("");
    setLoginPassword("");
    setLoginPasswordConfirm("");
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
      resetAuthForm();
      Alert.alert("Sucesso", "Login realizado!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao fazer login");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert("Erro", "Preencha e-mail e senha");
      return;
    }
    if (loginPassword.length < 6) {
      Alert.alert("Erro", "A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (loginPassword !== loginPasswordConfirm) {
      Alert.alert("Erro", "As senhas não coincidem");
      return;
    }
    setLoggingIn(true);
    try {
      await register(loginName.trim() || "Usuário", loginEmail.trim(), loginPassword);
      setLoggedIn(true);
      setShowLoginModal(false);
      resetAuthForm();
      Alert.alert("Sucesso", "Conta criada com sucesso!");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao criar conta");
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
      const result = await analyzeText(
        freeText,
        "TEXT",
        categories.map((c) => ({ id: c.id, name: c.name }))
      );
      const draft = result.draft;

      if (!draft || draft.amount <= 0) {
        Alert.alert("Aviso", "Não foi possível identificar o valor. Revise a transação manualmente.");
        return;
      }

      const isPending = draft.status === "PENDING";

      await createTransaction({
        description: draft.description || freeText.substring(0, 50),
        amount: draft.amount,
        type: draft.type || "EXPENSE",
        date: draft.date || toDateInputValue(new Date()),
        categoryId: draft.categoryId || selectedCategoryId,
        notes: isPending ? "Importado via texto (pendente de confirmação)" : "Importado via texto livre",
        status: draft.status || "PAID",
      });

      setFreeText("");
      if (isPending) {
        Alert.alert("Pendente", "Transação salva como pendente. Não foi possível determinar se é receita ou despesa — revise na aba Transações.");
      } else {
        Alert.alert("Sucesso", "Transação criada automaticamente!");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        Alert.alert("Limite atingido", "Seus tokens mensais acabaram. Vá em Plano para ver detalhes ou fazer upgrade.");
      } else {
        Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar");
      }
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
      const ocrResult = await ocrDocument(
        asset.uri,
        asset.mimeType || "application/pdf",
        categories.map((c) => ({ id: c.id, name: c.name }))
      );

      const draft = ocrResult.draft;
      if (!draft || !draft.amount || Number(draft.amount) <= 0) {
        Alert.alert("Aviso", "Não foi possível identificar o valor no documento. Revise manualmente.");
        return;
      }

      await createTransaction({
        description: (draft.description as string) || `Documento: ${asset.name}`,
        amount: Number(draft.amount),
        type: normalizeType(draft.type),
        date: (draft.date as string) || toDateInputValue(new Date()),
        categoryId: (draft.categoryId as string) || selectedCategoryId,
        notes: `Importado via documento: ${asset.name}`,
        status: "PENDING",
      });

      Alert.alert("Sucesso", "Transação criada automaticamente!");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        Alert.alert("Limite atingido", "Seus tokens mensais acabaram. Vá em Plano para ver detalhes ou fazer upgrade.");
      } else {
        Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar documento");
      }
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
      if (err instanceof ApiError && err.code === "TOKEN_LIMIT_EXCEEDED") {
        Alert.alert("Limite atingido", "Seus tokens mensais acabaram. Vá em Plano para ver detalhes ou fazer upgrade.");
      } else {
        Alert.alert("Erro", err instanceof Error ? err.message : "Falha ao processar áudio");
      }
    } finally {
      setProcessingAudio(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Importar</Text>
          <Text style={styles.subtitle}>Adicione transações de forma inteligente</Text>
        </View>
        {loggedIn ? (
          <Pressable style={styles.authChip} onPress={handleLogout}>
            <View style={styles.authDot} />
            <Text style={styles.authChipText}>Conectado</Text>
          </Pressable>
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
                : "Autorize o acesso para importar automaticamente."}
            </Text>
          </View>
          {!granted && (
            <Pressable style={styles.statusBtn} onPress={openSettings}>
              <Text style={styles.statusBtnText}>Ativar</Text>
            </Pressable>
          )}
        </View>

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
              colors={["#a78bfa", "#7c3aed"]}
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

        {/* Category selector */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              <Text style={styles.sectionLabel}>Categoria padrão</Text>
            </View>
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
                      style={[
                        styles.pillDot,
                        { backgroundColor: active ? "rgba(255,255,255,0.8)" : cat.color },
                      ]}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        active && { color: "#fff" },
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

        {/* Recent imports */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>
              Importações recentes ({recentImports.length})
            </Text>
          </View>
          {recentImports.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-download-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma importação recente</Text>
              <Text style={styles.emptyHint}>
                Use os métodos acima ou ative as notificações bancárias.
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
                  <View style={styles.importCard}>
                    <View style={styles.importCardHeader}>
                      <View
                        style={[
                          styles.importBadge,
                          {
                            backgroundColor: isIncome
                              ? colors.incomeBg
                              : colors.expenseBg,
                          },
                        ]}
                      >
                        <Ionicons
                          name={isIncome ? "arrow-up" : "arrow-down"}
                          size={12}
                          color={isIncome ? colors.incomeFg : colors.expenseFg}
                        />
                        <Text
                          style={[
                            styles.importBadgeText,
                            {
                              color: isIncome
                                ? colors.incomeFg
                                : colors.expenseFg,
                            },
                          ]}
                        >
                          {item.bank}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.importAmount,
                          {
                            color: isIncome ? colors.incomeFg : colors.expenseFg,
                          },
                        ]}
                      >
                        {isIncome ? "+" : "-"}{formatCurrency(item.amount)}
                      </Text>
                    </View>
                    <Text style={styles.importDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <View style={styles.importFooter}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={styles.importFooterText}>Importado automaticamente</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* Auth modal */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
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

const styles = StyleSheet.create({
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
});
