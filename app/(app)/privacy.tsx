import { colors, radius, spacing } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

export default function PrivacyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), [isDark]);

  const handleEmailSupport = () => {
    Linking.openURL('mailto:jonathas.duarte78@gmail.com');
  };

  const handleExerciseRights = () => {
    Linking.openURL('mailto:jonathas.duarte78@gmail.com?subject=Exercício de Direitos LGPD');
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Política de Privacidade</Text>
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
          <Text style={styles.sectionTitle}>1. Compromisso com sua Privacidade</Text>
          <Text style={styles.sectionText}>
            No Kilun, levamos sua privacidade muito a sério. Esta política explica como coletamos, usamos, armazenamos e protegemos suas informações pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e outras regulamentações aplicáveis.
          </Text>
        </View>

        {/* Data Collection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Informações que Coletamos</Text>
          
          <Text style={styles.subsectionTitle}>Dados Fornecidos por Você:</Text>
          <View style={styles.dataList}>
            <View style={styles.dataItem}>
              <Ionicons name="person-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Nome, e-mail e foto de perfil</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Dados de transações financeiras (receitas, despesas, categorias)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Categorias personalizadas e transações recorrentes</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Documentos importados (boletos, notas fiscais, recibos) para extração via OCR</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="mic-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Áudios gravados para transcrição de transações</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="camera-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Imagens capturadas para reconhecimento via IA</Text>
            </View>
          </View>

          <Text style={styles.subsectionTitle}>Dados Coletados Automaticamente:</Text>
          <View style={styles.dataList}>
            <View style={styles.dataItem}>
              <Ionicons name="analytics-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Estatísticas de uso do aplicativo (anônimas)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Informações do dispositivo (modelo, sistema operacional, versão do app)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="notifications-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Conteúdo de notificações bancárias (com sua permissão explícita)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="server-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Endereço IP e logs de acesso para segurança</Text>
            </View>
          </View>
        </View>

        {/* Legal Basis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Base Legal para o Tratamento</Text>
          <Text style={styles.sectionText}>
            Tratamos seus dados pessoais com base nas seguintes hipóteses legais previstas pela LGPD:
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Execução de contrato (Art. 7º, V): para fornecer os serviços contratados</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Consentimento (Art. 7º, I): para processamento de notificações bancárias, áudio, imagens e documentos</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Legítimo interesse (Art. 7º, IX): para melhorar o app e prevenir fraudes</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Cumprimento de obrigação legal (Art. 7º, II): quando exigido por lei</Text>
            </View>
          </View>
        </View>

        {/* Data Usage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Como Usamos Suas Informações</Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para fornecer e melhorar nossos serviços</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para processar transações e gerar relatórios</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para usar inteligência artificial na categorização e extração de dados</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para transcrever áudios e reconhecer documentos via OCR</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para backup e segurança dos seus dados</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Para comunicação e suporte ao cliente</Text>
            </View>
          </View>
        </View>

        {/* Data Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Armazenamento e Segurança</Text>
          <Text style={styles.sectionText}>
            • Seus dados são armazenados em servidores seguros com criptografia{'\n'}
            • Backup automático diário para proteção contra perdas{'\n'}
            • Acesso restrito e monitorado às informações{'\n'}
            • Medidas de segurança técnicas e administrativas{'\n'}
            • Cumprimos as melhores práticas de segurança da indústria
          </Text>
          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark" size={16} color={colors.success} />
            <Text style={styles.securityText}>
              Utilizamos criptografia AES-256 para proteger seus dados financeiros.
            </Text>
          </View>
        </View>

        {/* Data Sharing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Compartilhamento de Dados</Text>
          <Text style={styles.sectionText}>
            <Text style={styles.boldText}>NUNCA vendemos suas informações pessoais.</Text>
          </Text>
          <Text style={styles.sectionText}>
            Compartilhamos dados apenas nas seguintes situações:
          </Text>
          <View style={styles.dataList}>
            <View style={styles.dataItem}>
              <Ionicons name="cloud-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Com provedores de IA para processamento (Google Gemini, OpenAI)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="server-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Com provedores de infraestrutura em nuvem (hospedagem e armazenamento)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Com processadores de pagamento (assinaturas)</Text>
            </View>
            <View style={styles.dataItem}>
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <Text style={styles.dataText}>Quando exigido por lei ou ordem judicial</Text>
            </View>
          </View>
        </View>

        {/* LGPD Rights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Seus Direitos (LGPD)</Text>
          <Text style={styles.sectionText}>
            Conforme o Art. 18 da LGPD, você tem direito a:
          </Text>
          <View style={styles.rightsList}>
            <View style={styles.rightItem}>
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Acesso</Text>
                <Text style={styles.rightDescription}>Saber quais dados temos sobre você</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Correção</Text>
                <Text style={styles.rightDescription}>Atualizar dados incorretos ou desatualizados</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="trash-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Eliminação</Text>
                <Text style={styles.rightDescription}>Solicitar exclusão de seus dados (direito ao esquecimento)</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Portabilidade</Text>
                <Text style={styles.rightDescription}>Transferir seus dados para outro serviço</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="ban-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Oposição</Text>
                <Text style={styles.rightDescription}>Opôr-se ao tratamento de seus dados</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Informação</Text>
                <Text style={styles.rightDescription}>Saber sobre o compartilhamento de seus dados</Text>
              </View>
            </View>
            <View style={styles.rightItem}>
              <Ionicons name="close-circle-outline" size={16} color={colors.primary} />
              <View style={styles.rightContent}>
                <Text style={styles.rightTitle}>Revogação do Consentimento</Text>
                <Text style={styles.rightDescription}>Retirar o consentimento a qualquer momento (Art. 8º, §5º)</Text>
              </View>
            </View>
          </View>
          <Text style={styles.sectionText}>
            Os pedidos serão respondidos em até 15 dias úteis, conforme previsto pelo Art. 19 da LGPD. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) caso entenda que seus direitos foram violados.
          </Text>
          <TouchableOpacity style={styles.rightsButton} onPress={handleExerciseRights}>
            <Ionicons name="mail-outline" size={16} color="#fff" />
            <Text style={styles.rightsButtonText}>Exercer meus direitos</Text>
          </TouchableOpacity>
        </View>

        {/* Cookies and Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Cookies e Rastreamento</Text>
          <Text style={styles.sectionText}>
            • Não utilizamos cookies para rastreamento cruzado{'\n'}
            • Usamos analytics anônimos para melhorar o app{'\n'}
            • Respeitamos as configurações de privacidade do seu dispositivo{'\n'}
            • Não fazemos perfilamento para publicidade
          </Text>
        </View>

        {/* Data Retention */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Retenção de Dados</Text>
          <Text style={styles.sectionText}>
            • Mantemos seus dados enquanto sua conta estiver ativa{'\n'}
            • Dados de transações são mantidos para histórico financeiro enquanto a conta existir{'\n'}
            • Áudios e imagens processados por IA são excluídos após o processamento{'\n'}
            • Conteúdo de notificações bancárias é processado e descartado imediatamente{'\n'}
            • Ao excluir a conta, todos os dados são permanentemente removidos em até 30 dias{'\n'}
            • Excluímos dados quando solicitado ou quando exigido por lei
          </Text>
        </View>

        {/* International Transfers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Transferência Internacional</Text>
          <Text style={styles.sectionText}>
            Alguns dados podem ser processados fora do Brasil por provedores de IA (Google Gemini, OpenAI) e provedores de infraestrutura em nuvem. Garantimos que essas transferências ocorram em conformidade com o Art. 33 da LGPD, utilizando cláusulas contratuais padrão ou garantias equivalentes de proteção de dados.
          </Text>
        </View>

        {/* Children */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Proteção de Crianças</Text>
          <Text style={styles.sectionText}>
            Nosso serviço não é direcionado a menores de 18 anos. Não coletamos intencionalmente informações de crianças ou adolescentes. Se descobrirmos que coletamos dados de menor de 18 anos, os excluiremos imediatamente, em conformidade com o Estatuto da Criança e do Adolescente (ECA - Lei nº 8.069/1990) e a LGPD.
          </Text>
        </View>

        {/* Changes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>12. Alterações nesta Política</Text>
          <Text style={styles.sectionText}>
            Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas através do aplicativo. A data da última atualização está sempre no topo deste documento.
          </Text>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>13. Encarregado de Dados (DPO)</Text>
          <Text style={styles.sectionText}>
            Para exercer seus direitos, tirar dúvidas ou reportar problemas relacionados à privacidade, entre em contato com nosso Encarregado pelo Tratamento de Dados Pessoais (DPO), conforme exigido pelo Art. 41 da LGPD:
          </Text>
          <TouchableOpacity style={styles.contactButton} onPress={handleEmailSupport}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={styles.contactButtonText}>jonathas.duarte78@gmail.com</Text>
          </TouchableOpacity>
          <Text style={styles.contactInfo}>
            Assunto: &ldquo;Privacidade e Proteção de Dados - LGPD&rdquo;
          </Text>
        </View>

        {/* Authority */}
        <View style={styles.authorityCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <View style={styles.authorityContent}>
            <Text style={styles.authorityTitle}>Conformidade LGPD</Text>
            <Text style={styles.authorityText}>
              Esta política está em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), suas atualizações e as resoluções da Autoridade Nacional de Proteção de Dados (ANPD).
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>
          Kilun © 2026 - Privacidade e Segurança em Primeiro Lugar
        </Text>
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
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  boldText: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  dataList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dataText: {
    fontSize: 14,
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
  securityBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.success + "1a",
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  rightsList: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  rightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  rightContent: {
    flex: 1,
  },
  rightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rightDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rightsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  rightsButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
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
  contactInfo: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
  authorityCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.info + "1a",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  authorityContent: {
    flex: 1,
    gap: spacing.sm,
  },
  authorityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  authorityText: {
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
  });
}
