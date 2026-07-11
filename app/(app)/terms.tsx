import { setTermsAccepted } from "@/lib/auth";
import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TermsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);
  const { fromOnboarding } = useLocalSearchParams<{ fromOnboarding?: string }>();
  const isOnboarding = fromOnboarding === "true";

  const handleAccept = async () => {
    await setTermsAccepted();
    if (isOnboarding) {
      router.replace("/login" as any);
    } else {
      router.back();
    }
  };

  const handleEmailSupport = () => {
    Linking.openURL('mailto:jonathas.duarte78@gmail.com');
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        {!isOnboarding && (
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {isOnboarding && <View style={{ width: 24 }} />}
        <Text style={styles.headerTitle}>Termos de Uso</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Last Updated */}
        <View style={styles.updateCard}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          <Text style={styles.updateText}>Última atualização: 11 de julho de 2026</Text>
        </View>

        {/* Introduction */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Aceitação dos Termos</Text>
          <Text style={styles.sectionText}>
            Bem-vindo ao Kilun. Ao usar nosso aplicativo, você concorda com estes Termos de Uso e nossa Política de Privacidade. Se você não concordar, não use o aplicativo.
          </Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Descrição do Serviço</Text>
          <Text style={styles.sectionText}>
            O Kilun é um aplicativo de controle financeiro pessoal que oferece:
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Organização de transações financeiras</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Relatórios e exportação de dados</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Importação com inteligência artificial</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Backup automático de dados</Text>
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Conta e Responsabilidade</Text>
          <Text style={styles.sectionText}>
            • Você é responsável por manter a segurança de sua conta{'\n'}
            • Forneça informações verdadeiras e atualizadas{'\n'}
            • Não compartilhe seus dados de login{'\n'}
            • Você é responsável por todas as atividades em sua conta
          </Text>
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Assinatura Kilun Pro</Text>
          <Text style={styles.sectionText}>
            • Assinatura mensal de R$ 14,90{'\n'}
            • Renovação automática mensal{'\n'}
            • Cancele a qualquer momento nas configurações do Google Play{'\n'}
            • Sem reembolso proporcional{'\n'}
            • Tokens de IA resetam todo dia 1 de cada mês
          </Text>
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle" size={16} color={colors.primary} />
            <Text style={styles.noticeText}>
              A assinatura é gerenciada pelo Google Play. Para cancelar, acesse as configurações do Google Play no seu dispositivo.
            </Text>
          </View>
        </View>

        {/* Acceptable Use */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Uso Aceitável</Text>
          <Text style={styles.sectionText}>
            Você concorda em não:
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.featureText}>Usar o app para atividades ilegais</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.featureText}>Tentar hackear ou danificar o sistema</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.featureText}>Compartilhar conteúdo ofensivo ou inadequado</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.featureText}>Violar direitos de terceiros</Text>
            </View>
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Privacidade e Proteção de Dados (LGPD)</Text>
          <Text style={styles.sectionText}>
            Sua privacidade é importante para nós. Tratamos seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e as resoluções da Autoridade Nacional de Proteção de Dados (ANPD). Nossa Política de Privacidade explica detalhadamente como coletamos, usamos, armazenamos e protegemos seus dados, bem como seus direitos como titular, incluindo acesso, correção, eliminação, portabilidade, oposição e revogação de consentimento.
          </Text>
          <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/privacy')}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={styles.linkButtonText}>Ver Política de Privacidade</Text>
          </TouchableOpacity>
        </View>

        {/* Intellectual Property */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Propriedade Intelectual</Text>
          <Text style={styles.sectionText}>
            O Kilun e todo seu conteúdo são protegidos por direitos autorais e outras leis de propriedade intelectual. Você não pode copiar, modificar ou distribuir nosso conteúdo sem permissão.
          </Text>
        </View>

        {/* Limitation of Liability */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Limitação de Responsabilidade</Text>
          <Text style={styles.sectionText}>
            O app é fornecido &ldquo;como está&rdquo; sem garantias. Não nos responsabilizamos por perdas diretas, indiretas, incidentais ou consequenciais resultantes do uso do app.
          </Text>
        </View>

        {/* Changes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Alterações nos Termos</Text>
          <Text style={styles.sectionText}>
            Podemos atualizar estes termos periodicamente. Notificaremos sobre mudanças significativas através do app. Continuar usando o app após as alterações constitui aceitação.
          </Text>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Contato</Text>
          <Text style={styles.sectionText}>
            Para dúvidas sobre estes termos, entre em contato:
          </Text>
          <TouchableOpacity style={styles.contactButton} onPress={handleEmailSupport}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={styles.contactButtonText}>jonathas.duarte78@gmail.com</Text>
          </TouchableOpacity>
        </View>

        {/* Agreement */}
        <View style={styles.agreementCard}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <View style={styles.agreementContent}>
            <Text style={styles.agreementTitle}>Ao usar o Kilun, você:</Text>
            <Text style={styles.agreementText}>
              • Confirma que leu e entendeu estes termos{'\n'}
              • Concorda em cumprir todas as obrigações aqui descritas{'\n'}
              • Reconhece que estes termos formam um acordo legalmente vinculativo
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>
          Kilun © 2026 - Todos os direitos reservados
        </Text>

        {isOnboarding && (
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.acceptButtonText}>Aceitar Termos</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  updateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  updateText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  featureList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.info + "1a",
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: spacing.md,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  agreementCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.success + "1a",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
  },
  agreementContent: {
    flex: 1,
    gap: spacing.sm,
  },
  agreementTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  agreementText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  acceptButtonContainer: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginHorizontal: spacing.lg,
  },
  acceptButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
  },
  });
}
