import { Button } from "@/components/ui/button";
import { forgotPassword, resetPassword } from "@/lib/auth";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "email" | "reset";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSendCode = async () => {
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Informe seu e-mail");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("E-mail inválido");
      return;
    }

    setLoading(true);
    try {
      const result = await forgotPassword(email.trim());
      setSuccess(result.message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao solicitar código");
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setSuccess(null);

    if (!code.trim() || code.trim().length !== 6) {
      setError("O código deve ter 6 dígitos");
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("A senha deve conter pelo menos 1 letra e 1 número");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(
        email.trim(),
        code.trim(),
        password,
        confirmPassword
      );
      setSuccess(result.message);
      setTimeout(() => {
        router.replace("/login" as any);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha");
      return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Recuperar senha</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={step === "email" ? "mail-outline" : "key-outline"}
            size={40}
            color={colors.primary}
          />
        </View>

        <Text style={styles.hint}>
          {step === "email"
            ? "Informe seu e-mail para receber um código de recuperação."
            : "Digite o código recebido por e-mail e sua nova senha."}
        </Text>

        {error && (
          <View style={styles.alertError}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        )}

        {success && (
          <View style={styles.alertSuccess}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.alertSuccessText}>{success}</Text>
          </View>
        )}

        {step === "email" ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <Button title="Enviar código" onPress={handleSendCode} loading={loading} />
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={[styles.input, { color: colors.textMuted }]}
                value={email}
                editable={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Código (6 dígitos)</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Nova senha</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres, 1 letra e 1 número"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirmar senha</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repita a nova senha"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Button title="Redefinir senha" onPress={handleResetPassword} loading={loading} />

            <Pressable
              style={styles.resendBtn}
              onPress={() => {
                setStep("email");
                setCode("");
                setPassword("");
                setConfirmPassword("");
                setError(null);
                setSuccess(null);
              }}
            >
              <Text style={styles.resendText}>Reenviar código</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  iconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  alertError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.danger + "18",
    borderWidth: 1,
    borderColor: colors.danger + "44",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertErrorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "600",
  },
  alertSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.success + "18",
    borderWidth: 1,
    borderColor: colors.success + "44",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertSuccessText: {
    flex: 1,
    fontSize: 13,
    color: colors.success,
    fontWeight: "600",
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  resendText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  });
}
