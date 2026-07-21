import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { extractTransactionFromPhoto } from "@/lib/ai";
import { isAuthenticated } from "@/lib/auth";
import { listCategories } from "@/lib/repositories/categories";
import { createTransaction, updateTransaction } from "@/lib/repositories/transactions";
import { colors, radius, spacing } from "@/lib/theme";
import type { Category, DocumentType, PaymentMethod, Transaction, TransactionStatus, TransactionType } from "@/lib/types";
import { formatCurrencyInput, normalizePaymentMethod, parseCurrencyInput, toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const documentTypeMeta: Record<DocumentType, {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  paymentMethod?: PaymentMethod;
}> = {
  NORMAL: { label: "Gasto Normal", description: "Descrição, valor, data e categoria.", icon: "receipt-outline", color: colors.textMuted },
  BOLETO: { label: "Boleto", description: "Beneficiário, código de barras, vencimento e documento.", icon: "barcode-outline", color: colors.warning, paymentMethod: "BOLETO" },
  NOTA_FISCAL: { label: "Nota Fiscal", description: "Emitente, CNPJ/CPF e número da nota.", icon: "document-text-outline", color: colors.info },
  COMPROVANTE_PIX: { label: "Comprovante PIX", description: "Pagador/recebedor, chave PIX e CPF/CNPJ.", icon: "qr-code-outline", color: colors.success, paymentMethod: "PIX" },
  COMPROVANTE_BANCARIO: { label: "Comprovante Bancário", description: "Banco, favorecido e CPF/CNPJ.", icon: "business-outline", color: colors.primary, paymentMethod: "BANK_TRANSFER" },
  OUTRO: { label: "Outro", description: "Campos extras opcionais para identificar o documento.", icon: "folder-outline", color: colors.cardOrange, paymentMethod: "OTHER" },
};

const documentTypeOptions = Object.entries(documentTypeMeta).map(([value, meta]) => ({ value: value as DocumentType, ...meta }));

const statusOptions: { key: TransactionStatus; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "PAID", label: "Pago", icon: "checkmark-circle", color: colors.success },
  { key: "PENDING", label: "A vencer", icon: "time-outline", color: colors.warning },
  { key: "OVERDUE", label: "Vencido", icon: "alert-circle", color: colors.danger },
];

interface TransactionFormModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly editingItem?: Transaction | null;
  readonly defaultType?: TransactionType;
  readonly defaultStatus?: TransactionStatus;
}

export function TransactionFormModal({
  visible,
  onClose,
  onSaved,
  editingItem,
  defaultType = "EXPENSE",
  defaultStatus = "PENDING",
}: TransactionFormModalProps) {
  const styles = useMemo(() => createFormStyles(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>(defaultType);
  const [status, setStatus] = useState<TransactionStatus>(defaultStatus);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [documentType, setDocumentType] = useState<DocumentType>("NORMAL");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [boletoNumber, setBoletoNumber] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string; variant?: "default" | "warning" | "danger" | "success" } | null>(null);
  const selectedDocumentMeta = documentTypeMeta[documentType];

  useEffect(() => {
    if (!visible) return;
    listCategories().then((cats) => {
      setCategories(cats);
      if (!editingItem && cats.length > 0) setCategoryId(cats[0].id);
    });
    setErr(null);
  }, [visible, editingItem]);

  useEffect(() => {
    if (editingItem) {
      setDescription(editingItem.description);
      setAmount(formatCurrencyInput(Number(editingItem.amount)));
      setType(editingItem.type);
      setStatus(editingItem.status);
      setPaymentMethod(editingItem.paymentMethod);
      setDocumentType(editingItem.documentType);
      setDate(editingItem.date);
      setCategoryId(editingItem.categoryId);
      setBoletoNumber(editingItem.boletoNumber ?? "");
      setCnpj(editingItem.cnpj ?? "");
      setRecipientName(editingItem.recipientName ?? "");
      setExtraNotes(editingItem.notes ?? "");
      setDocumentNumber("");
      setPixKey("");
      setBankName("");
      setFineAmount("");
      setInterestAmount("");
      setDiscountAmount("");
    } else {
      setDescription("");
      setAmount("");
      setType(defaultType);
      setStatus(defaultStatus);
      setPaymentMethod("CASH");
      setDocumentType("NORMAL");
      setDate(toDateInputValue(new Date()));
      setCategoryId(null);
      setBoletoNumber("");
      setCnpj("");
      setRecipientName("");
      setDocumentNumber("");
      setPixKey("");
      setBankName("");
      setFineAmount("");
      setInterestAmount("");
      setDiscountAmount("");
      setExtraNotes("");
    }
  }, [editingItem, visible, defaultType, defaultStatus]);

  const handleDocumentTypeChange = (nextDocumentType: DocumentType) => {
    setDocumentType(nextDocumentType);
    const nextPaymentMethod = documentTypeMeta[nextDocumentType].paymentMethod;
    if (nextPaymentMethod) setPaymentMethod(nextPaymentMethod);
  };

  const buildNotes = useCallback(() => {
    const detailLines = [
      documentNumber.trim() ? `Número do documento: ${documentNumber.trim()}` : null,
      pixKey.trim() ? `Chave PIX: ${pixKey.trim()}` : null,
      bankName.trim() ? `Banco/Instituição: ${bankName.trim()}` : null,
      fineAmount.trim() ? `Multa: ${fineAmount.trim()}` : null,
      interestAmount.trim() ? `Juros: ${interestAmount.trim()}` : null,
      discountAmount.trim() ? `Desconto: ${discountAmount.trim()}` : null,
      extraNotes.trim() || null,
    ].filter(Boolean);
    return detailLines.length > 0 ? detailLines.join("\n") : null;
  }, [documentNumber, pixKey, bankName, fineAmount, interestAmount, discountAmount, extraNotes]);

  const handlePhotoScan = async () => {
    try {
      const authed = await isAuthenticated();
      if (!authed) {
        setInfoDialog({ title: "Login necessário", message: "Faça login na aba Importar para usar o escaneamento por IA.", variant: "warning" });
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setInfoDialog({ title: "Permissão", message: "Precisamos de acesso à câmera para escanear recibos.", variant: "warning" });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: ["images"] });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      setScanning(true);
      setErr(null);
      const asset = result.assets[0];
      const extracted = await extractTransactionFromPhoto(asset.base64 as string, asset.mimeType ?? "image/jpeg");
      setDescription(extracted.description);
      setAmount(formatCurrencyInput(extracted.amount));
      setType(extracted.type);
      setPaymentMethod(normalizePaymentMethod(extracted.paymentMethod));
      setDocumentType(extracted.documentType ?? "NORMAL");
      setDate(extracted.date);
      setBoletoNumber(extracted.boletoNumber ?? "");
      setCnpj(extracted.cnpj ?? "");
      setRecipientName(extracted.recipientName ?? "");
      setDocumentNumber(extracted.documentNumber ?? "");
      setPixKey(extracted.pixKey ?? "");
      setBankName(extracted.institution ?? "");
      setFineAmount(extracted.fineAmount != null ? formatCurrencyInput(extracted.fineAmount) : "");
      setInterestAmount(extracted.interestAmount != null ? formatCurrencyInput(extracted.interestAmount) : "");
      setDiscountAmount(extracted.discountAmount != null ? formatCurrencyInput(extracted.discountAmount) : "");
      setExtraNotes(extracted.notes ?? "");
      if (extracted.categoryName) {
        const match = categories.find((c) => c.name.toLowerCase() === extracted.categoryName!.toLowerCase());
        if (match) setCategoryId(match.id);
      }
    } catch (error) {
      setInfoDialog({ title: "Erro ao escanear", message: error instanceof Error ? error.message : "Falha ao processar imagem", variant: "danger" });
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseCurrencyInput(amount);
    if (!description.trim()) { setErr("Informe a descrição"); return; }
    if (parsedAmount <= 0) { setErr("Informe um valor válido"); return; }
    if (!categoryId) { setErr("Selecione uma categoria"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr("Data inválida (use AAAA-MM-DD)"); return; }

    const notes = buildNotes();
    setErr(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateTransaction(editingItem.id, {
          description: description.trim(),
          amount: parsedAmount,
          type,
          status,
          paymentMethod,
          documentType,
          date,
          categoryId,
          notes,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
        });
      } else {
        await createTransaction({
          description: description.trim(),
          amount: parsedAmount,
          type,
          status,
          paymentMethod,
          documentType,
          date,
          categoryId,
          notes,
          boletoNumber: boletoNumber.trim() || null,
          cnpj: cnpj.trim() || null,
          recipientName: recipientName.trim() || null,
        });
      }
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.formTitle}>{editingItem ? "Editar transação" : "Nova transação"}</Text>
            {!editingItem && (
              <Pressable onPress={handlePhotoScan} disabled={scanning} hitSlop={10}>
                {scanning ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="camera-outline" size={24} color={colors.primary} />}
              </Pressable>
            )}
            {editingItem && <View style={{ width: 26 }} />}
          </View>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeButton, type === "EXPENSE" && { backgroundColor: colors.expenseBg, borderColor: colors.expenseFg }]}
                onPress={() => setType("EXPENSE")}
              >
                <Ionicons name="arrow-down" size={18} color={type === "EXPENSE" ? colors.expenseFg : colors.textMuted} />
                <Text style={[styles.typeLabel, type === "EXPENSE" && { color: colors.expenseFg }]}>Despesa</Text>
              </Pressable>
              <Pressable
                style={[styles.typeButton, type === "INCOME" && { backgroundColor: colors.incomeBg, borderColor: colors.incomeFg }]}
                onPress={() => setType("INCOME")}
              >
                <Ionicons name="arrow-up" size={18} color={type === "INCOME" ? colors.incomeFg : colors.textMuted} />
                <Text style={[styles.typeLabel, type === "INCOME" && { color: colors.incomeFg }]}>Receita</Text>
              </Pressable>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusRow}>
                {statusOptions.map((s) => (
                  <Pressable
                    key={s.key}
                    style={[styles.statusButton, status === s.key && { borderColor: s.color, backgroundColor: s.color + "15" }]}
                    onPress={() => setStatus(s.key)}
                  >
                    <Ionicons name={s.icon} size={16} color={status === s.key ? s.color : colors.textMuted} />
                    <Text style={[styles.statusLabel, status === s.key && { color: s.color }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Tipo de Documento</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.documentTypeRow}>
                {documentTypeOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.documentTypeCard, documentType === option.value && { borderColor: option.color }]}
                    onPress={() => handleDocumentTypeChange(option.value)}
                  >
                    <View style={[styles.documentTypeIcon, { backgroundColor: `${option.color}22` }]}>
                      <Ionicons name={option.icon} size={18} color={option.color} />
                    </View>
                    <Text style={[styles.documentTypeTitle, documentType === option.value && { color: option.color }]}>{option.label}</Text>
                    <Text style={styles.documentTypeDescription}>{option.description}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={[styles.documentHint, { borderLeftColor: selectedDocumentMeta.color }]}>
                <Ionicons name={selectedDocumentMeta.icon} size={18} color={selectedDocumentMeta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.documentHintTitle}>{selectedDocumentMeta.label}</Text>
                  <Text style={styles.documentHintText}>{selectedDocumentMeta.description}</Text>
                </View>
              </View>
            </View>

            <Input label="Descrição" value={description} onChangeText={setDescription} placeholder="Ex: Mercado" />
            <Input label="Valor" value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" />
            <DatePicker label={status !== "PAID" ? "Data de vencimento" : "Data"} value={date} onChange={setDate} />

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Método de Pagamento</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {[
                  { id: "CASH", label: "Dinheiro", icon: "cash-outline" },
                  { id: "PIX", label: "PIX", icon: "qr-code" },
                  { id: "CREDIT_CARD", label: "Crédito", icon: "card" },
                  { id: "DEBIT_CARD", label: "Débito", icon: "card" },
                  { id: "BOLETO", label: "Boleto", icon: "document-text" },
                  { id: "BANK_TRANSFER", label: "Transferência", icon: "swap-horizontal" },
                  { id: "MERCADO_PAGO", label: "Mercado Pago", icon: "logo-usd" },
                  { id: "OTHER", label: "Outro", icon: "ellipsis-horizontal" },
                ].map((method) => (
                  <Pressable
                    key={method.id}
                    style={[styles.pill, paymentMethod === method.id && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setPaymentMethod(method.id as PaymentMethod)}
                  >
                    <Ionicons name={method.icon as keyof typeof Ionicons.glyphMap} size={16} color={paymentMethod === method.id ? colors.textInverse : colors.textMuted} />
                    <Text style={[styles.pillText, paymentMethod === method.id && { color: colors.textInverse }]}>{method.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {documentType !== "NORMAL" && (
              <View style={styles.documentFieldsCard}>
                <Text style={styles.documentFieldsTitle}>Dados do documento</Text>
                {documentType === "BOLETO" && (
                  <>
                    <Input label="Quem recebeu" value={recipientName} onChangeText={setRecipientName} placeholder="Nome da empresa ou pessoa" autoCapitalize="words" />
                    <Input label="Código de barras / linha digitável" value={boletoNumber} onChangeText={setBoletoNumber} placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000" autoCapitalize="characters" autoCorrect={false} />
                    <Input label="CPF/CNPJ do beneficiário" value={cnpj} onChangeText={setCnpj} placeholder="000.000.000-00 ou 00.000.000/0000-00" autoCapitalize="characters" autoCorrect={false} keyboardType="numbers-and-punctuation" />
                    <View style={styles.documentFieldGrid}>
                      <Input label="Multa" value={fineAmount} onChangeText={setFineAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                      <Input label="Juros" value={interestAmount} onChangeText={setInterestAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                      <Input label="Desconto" value={discountAmount} onChangeText={setDiscountAmount} placeholder="0,00" keyboardType="decimal-pad" style={styles.documentGridInput} />
                    </View>
                  </>
                )}
                {documentType === "NOTA_FISCAL" && (
                  <>
                    <Input label="Emitente" value={recipientName} onChangeText={setRecipientName} placeholder="Empresa emissora" autoCapitalize="words" />
                    <Input label="CPF/CNPJ do emitente" value={cnpj} onChangeText={setCnpj} placeholder="000.000.000-00 ou 00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
                    <Input label="Número da nota" value={documentNumber} onChangeText={setDocumentNumber} placeholder="NF-e / cupom / série" autoCapitalize="characters" />
                  </>
                )}
                {documentType === "COMPROVANTE_PIX" && (
                  <>
                    <Input label="Pagador ou recebedor" value={recipientName} onChangeText={setRecipientName} placeholder="Nome da pessoa ou empresa" autoCapitalize="words" />
                    <Input label="CPF/CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="Documento se disponível" keyboardType="numbers-and-punctuation" />
                    <Input label="Chave PIX" value={pixKey} onChangeText={setPixKey} placeholder="CPF, e-mail, telefone ou chave aleatória" autoCapitalize="none" />
                  </>
                )}
                {documentType === "COMPROVANTE_BANCARIO" && (
                  <>
                    <Input label="Favorecido" value={recipientName} onChangeText={setRecipientName} placeholder="Nome do favorecido" autoCapitalize="words" />
                    <Input label="Banco / instituição" value={bankName} onChangeText={setBankName} placeholder="Ex: Nubank, Itaú, Inter" autoCapitalize="words" />
                    <Input label="CPF/CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="Documento se disponível" keyboardType="numbers-and-punctuation" />
                  </>
                )}
                {documentType === "OUTRO" && (
                  <>
                    <Input label="Identificação do documento" value={documentNumber} onChangeText={setDocumentNumber} placeholder="Número, protocolo ou referência" />
                    <Input label="Responsável" value={recipientName} onChangeText={setRecipientName} placeholder="Pessoa ou empresa relacionada" autoCapitalize="words" />
                  </>
                )}
                <Input label="Observações do documento" value={extraNotes} onChangeText={setExtraNotes} placeholder="Detalhes adicionais" multiline textAlignVertical="top" style={styles.notesInput} />
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[styles.pill, categoryId === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]}
                    onPress={() => setCategoryId(cat.id)}
                  >
                    <View style={[styles.pillDot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.pillText, categoryId === cat.id && { color: colors.textInverse }]}>{cat.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}
            <Button title="Salvar" onPress={handleSave} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConfirmDialog
        visible={infoDialog !== null}
        title={infoDialog?.title ?? ""}
        message={infoDialog?.message ?? ""}
        confirmText="OK"
        cancelText=""
        variant={infoDialog?.variant ?? "default"}
        onCancel={() => setInfoDialog(null)}
        onConfirm={() => setInfoDialog(null)}
      />
    </Modal>
  );
}

function createFormStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    formTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    formContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["3xl"] },
    typeRow: { flexDirection: "row", gap: spacing.md },
    typeButton: {
      flex: 1,
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    typeLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
    statusRow: { flexDirection: "row", gap: spacing.sm },
    statusButton: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    statusLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    documentTypeRow: { gap: spacing.sm, paddingVertical: 2 },
    documentTypeCard: {
      width: 150,
      gap: 6,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    documentTypeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    documentTypeTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    documentTypeDescription: { fontSize: 10, lineHeight: 14, color: colors.textMuted },
    documentHint: {
      flexDirection: "row",
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      backgroundColor: colors.surfaceElevated,
    },
    documentHintTitle: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    documentHintText: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
    documentFieldsCard: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    documentFieldsTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    documentFieldGrid: { flexDirection: "row", gap: spacing.sm },
    documentGridInput: { minWidth: 92 },
    notesInput: { minHeight: 86, paddingTop: 12 },
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
    error: {
      fontSize: 13,
      color: colors.danger,
      backgroundColor: colors.expenseBg,
      padding: spacing.md,
      borderRadius: radius.md,
    },
  });
}
