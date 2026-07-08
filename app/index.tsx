import { Button } from "@/components/ui/button";
import { colors, radius, spacing } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const features = [
  { icon: "pie-chart-outline", title: "Controle completo", text: "Acompanhe receitas, despesas e metas em uma visão clara." },
  { icon: "sparkles-outline", title: "IA financeira", text: "Transforme textos, áudios e imagens em registros organizados." },
  { icon: "cloud-done-outline", title: "Backup seguro", text: "Proteja seus dados com backup local e nuvem." },
];

export default function Index() {
  const router = useRouter();

  const handleStart = async () => {
    const termsAccepted = await hasAcceptedTerms();
    if (termsAccepted) {
      router.replace("/login" as any);
    } else {
      router.push("/(app)/terms?fromOnboarding=true" as any);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <LinearGradient
        colors={["#0a0712", colors.background, "#1a0f32"]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoGlow}>
            <Image source={require("@/assets/images/Icone.png")} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.brandBlock}>
            <Text style={styles.kicker}>FINANCE MOBILE</Text>
            <Text style={styles.title}>Seu dinheiro organizado com inteligência</Text>
            <Text style={styles.subtitle}>
              Controle gastos, importe lançamentos, acompanhe metas e mantenha seus dados protegidos.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button title="Começar" onPress={handleStart} />
            <Pressable style={styles.secondaryButton} onPress={() => router.replace("/(app)/plan" as any)}>
              <Ionicons name="diamond-outline" size={17} color={colors.primaryLight} />
              <Text style={styles.secondaryButtonText}>Ver recursos Pro</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.featureGrid}>
          {features.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primaryLight} />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
    justifyContent: "center",
    gap: spacing["2xl"],
  },
  hero: {
    alignItems: "center",
    gap: spacing.xl,
  },
  logoGlow: {
    width: 190,
    height: 190,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: radius.xl,
  },
  brandBlock: {
    alignItems: "center",
    gap: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2.5,
    fontWeight: "800",
    color: colors.primaryLight,
  },
  title: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "900",
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 330,
  },
  actions: {
    width: "100%",
    gap: spacing.md,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(35,31,61,0.72)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: "700",
  },
  featureGrid: {
    gap: spacing.md,
  },
  featureCard: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(26,23,48,0.78)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.24)",
  },
  featureTextWrap: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  featureText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
