import { Button } from "@/components/ui/button";
import { login, register } from "@/lib/auth";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Erro", "Preencha todos os campos");
      return;
    }
    if (isRegister && !name.trim()) {
      Alert.alert("Erro", "Preencha seu nome");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(name.trim(), email.trim(), password.trim());
      } else {
        await login(email.trim(), password.trim());
      }
      router.replace("/(app)/dashboard");
    } catch (err) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{isRegister ? "Criar conta" : "Login"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Ionicons name={isRegister ? "person-add-outline" : "log-in-outline"} size={48} color={colors.primary} />
        </View>

        <Text style={styles.title}>{isRegister ? "Crie sua conta" : "Bem-vindo de volta"}</Text>
        <Text style={styles.subtitle}>
          {isRegister
            ? "Comece a organizar suas finanças em segundos"
            : "Entre para continuar de onde parou"}
        </Text>

        {isRegister && (
          <>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </>
        )}

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

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={isRegister ? "Mínimo 6 caracteres" : "Sua senha"}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Button
          title={isRegister ? "Criar conta" : "Entrar"}
          onPress={handleSubmit}
          loading={loading}
        />

        {!isRegister && (
          <Pressable
            style={{ alignItems: "center", paddingVertical: spacing.xs }}
            onPress={() => router.push("/(app)/forgot-password" as any)}
          >
            <Text style={styles.linkText}>Esqueci minha senha</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setIsRegister(!isRegister)}
          style={{ alignItems: "center", paddingVertical: spacing.md }}
        >
          <Text style={styles.switchText}>
            {isRegister ? "Já tem conta? Entrar" : "Não tem conta? Criar"}
          </Text>
        </Pressable>
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
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
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  switchText: {
    color: colors.primary,
    fontSize: 14,
  },
});
}
