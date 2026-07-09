/**
 * Configurações centralizadas de planos para Google Play Store
 * Garante consistência entre todas as telas de assinatura
 */

export interface PlanFeature {
  label: string;
  free: boolean | string;
  pro: boolean | string;
  icon?: string;
}

export interface PlanConfig {
  code: 'FREE' | 'PRO';
  name: string;
  description: string;
  price: number;
  priceDisplay: string;
  period: string;
  tokenLimit: number;
  features: PlanFeature[];
  color: string;
  badge?: string;
  popular?: boolean;
}

// Configurações padronizadas para Google Play Store
export const PLANS: Record<'FREE' | 'PRO', PlanConfig> = {
  FREE: {
    code: 'FREE',
    name: 'Gratuito',
    description: 'Controle suas finanças de forma simples e gratuita',
    price: 0,
    priceDisplay: 'R$ 0',
    period: 'para sempre',
    tokenLimit: Number(process.env.EXPO_PUBLIC_FREE_TOKEN_LIMIT ?? 100000),
    color: '#6b7280',
    features: [
      { label: 'Transações ilimitadas', free: true, pro: true },
      { label: 'Categorias ilimitadas', free: true, pro: true },
      { label: 'Relatório DRE', free: true, pro: true },
      { label: 'Exportar CSV', free: true, pro: true },
      { label: 'Backup automático', free: true, pro: true },
      { label: 'IA para importar por foto', free: '300/mês', pro: 'Ilimitado', icon: 'camera' },
      { label: 'IA para importar por texto', free: '150/mês', pro: 'Ilimitado', icon: 'text' },
      { label: 'Transcrição de áudio', free: '100/mês', pro: 'Ilimitado', icon: 'mic' },
      { label: 'OCR de documentos', free: false, pro: true, icon: 'document' },
      { label: 'Exportar Excel (XLSX)', free: false, pro: true, icon: 'grid' },
      { label: 'Exportar PDF', free: false, pro: true, icon: 'document-text' },
      { label: 'Suporte por e-mail', free: true, pro: true, icon: 'mail' },
      { label: 'Suporte prioritário', free: false, pro: true, icon: 'star' },
    ],
  },
  PRO: {
    code: 'PRO',
    name: 'Finance Pro',
    description: 'Recursos avançados com IA ilimitada para controle financeiro completo',
    price: 14.99,
    priceDisplay: 'R$ 14,99',
    period: 'por mês',
    tokenLimit: Number(process.env.EXPO_PUBLIC_PRO_TOKEN_LIMIT ?? 30000000),
    color: '#f472b6',
    badge: 'PRO',
    popular: true,
    features: [
      { label: 'Transações ilimitadas', free: true, pro: true },
      { label: 'Categorias ilimitadas', free: true, pro: true },
      { label: 'Relatório DRE', free: true, pro: true },
      { label: 'Exportar CSV', free: true, pro: true },
      { label: 'Backup automático', free: true, pro: true },
      { label: 'IA para importar por foto', free: '300/mês', pro: 'Ilimitado', icon: 'camera' },
      { label: 'IA para importar por texto', free: '150/mês', pro: 'Ilimitado', icon: 'text' },
      { label: 'Transcrição de áudio', free: '100/mês', pro: 'Ilimitado', icon: 'mic' },
      { label: 'OCR de documentos', free: false, pro: true, icon: 'document' },
      { label: 'Exportar Excel (XLSX)', free: false, pro: true, icon: 'grid' },
      { label: 'Exportar PDF', free: false, pro: true, icon: 'document-text' },
      { label: 'Suporte por e-mail', free: true, pro: true, icon: 'mail' },
      { label: 'Suporte prioritário', free: false, pro: true, icon: 'star' },
    ],
  },
};

// URLs e links para Google Play Store
export const SUBSCRIPTION_CONFIG = {
  purchaseUrl: 'https://backend-final-production-659a.up.railway.app/purchase',
  termsUrl: 'https://finance-app.com/terms',
  privacyUrl: 'https://finance-app.com/privacy',
  supportUrl: 'mailto:jonathas.duarte78@gmail.com',
};

// Textos para conformidade com Google Play Store
export const PLAY_STORE_TEXTS = {
  // Título e descrição do app
  appTitle: 'Finance App - Controle Financeiro',
  appShortDescription: 'Controle suas finanças com IA, exporte relatórios e tenha backup automático.',
  
  // Descrição completa para Google Play
  appFullDescription: `
O Finance App é a solução completa para controle financeiro pessoal com inteligência artificial.

🏦 **CONTROLE FINANCEIRO COMPLETO**
• Organize receitas e despesas em categorias personalizadas
• Visualize relatórios DRE para entender sua saúde financeira
• Exporte dados em CSV, Excel e PDF para controle total
• Backup automático diário para nunca perder seus dados

🤖 **INTELIGÊNCIA ARTIFICIAL**
• Importe transações pela câmera com OCR avançado
• Transcreva áudios de pagamentos automaticamente
• Extraia dados de textos e imagens com IA
• Categorização inteligente de transações

📊 **RECURSOS GRATUITOS**
• Transações e categorias ilimitadas
• Relatórios financeiros completos
• Exportação em CSV
• Backup automático
• ${PLANS.FREE.tokenLimit.toLocaleString('pt-BR')} tokens de IA por mês

💎 **FINANCE PRO - R$ 14,99/mês**
• ${PLANS.PRO.tokenLimit.toLocaleString('pt-BR')} tokens de IA por mês (uso intensivo)
• Importação por foto, texto e áudio ilimitados
• OCR de documentos (boleto, nota fiscal, etc.)
• Exportação em Excel e PDF
• Suporte prioritário

🔒 **SEGURANÇA E PRIVACIDADE**
• Seus dados são criptografados e armazenados com segurança
• Backup automático para proteção contra perdas
• Política de privacidade transparente
• Nunca compartilhamos seus dados com terceiros

Baixe agora e comece a controlar suas finanças de forma inteligente!

Perfeito para:
• Pessoas que querem organizar finances pessoais
• Autônomos e freelancers
• Pequenos empresários
• Quem busca controle financeiro com tecnologia
  `.trim(),
  
  // Textos de assinatura para Google Play Billing
  subscriptionTitle: 'Finance Pro',
  subscriptionDescription: 'Recursos avançados com IA ilimitada e exportação premium',
  subscriptionPrice: 'R$ 14,99/mês',
  
  // Textos de conformidade
  autoRenewing: 'Assinatura recorrente. Cancela a qualquer momento.',
  freeTrial: 'Experimente gratuitamente por 7 dias.',
  cancellation: 'Cancele a qualquer momento nas configurações do Google Play.',
  
  // Aviso de tokens
  tokenWarning: 'Tokens de IA são consumidos ao usar recursos de inteligência artificial.',
  tokenReset: 'Tokens resetam todo dia 1 de cada mês.',
};

// Validação para Google Play Store
export const PLAY_STORE_REQUIREMENTS = {
  // Requisitos de configuração
  hasPrivacyPolicy: true,
  hasTermsOfService: true,
  hasTargetAudience: true,
  hasContentRating: true,
  hasAppCategory: true,
  
  // Requisitos de assinatura
  hasSubscriptionManagement: true,
  hasClearPricing: true,
  hasAutoRenewalInfo: true,
  hasCancellationInfo: true,
  
  // Requisitos de conteúdo
  hasAccurateDescription: true,
  hasRealScreenshots: true,
  hasProperIcon: true,
  hasFeatureGraphic: true,
};

// Funções utilitárias
export function getPlanByCode(code: string): PlanConfig | null {
  return PLANS[code as keyof typeof PLANS] || null;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
}

export function getTokenDisplayText(limit: number): string {
  if (limit >= 1000000) {
    return `${(limit / 1000000).toFixed(1)}M`;
  }
  if (limit >= 1000) {
    return `${(limit / 1000).toFixed(0)}K`;
  }
  return limit.toString();
}

export function isFeatureAvailable(featureValue: boolean | string): boolean {
  return featureValue === true || featureValue === 'Ilimitado';
}

export function getFeatureDisplayValue(featureValue: boolean | string): string {
  if (featureValue === true) return '✓';
  if (featureValue === false) return '✗';
  return featureValue.toString();
}
