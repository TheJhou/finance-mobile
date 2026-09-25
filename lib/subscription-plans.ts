/**
 * Configurações centralizadas de planos para Google Play Store
 * Garante consistência entre todas as telas de assinatura
 */

import { BACKEND_URL } from "@/lib/config";

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

/**
 * Recursos de cada plano. Só o que o app entrega: o que é PRO aqui é bloqueado
 * pelo backend para o FREE (assertProPlan), e vice-versa.
 */
const PLAN_FEATURES: PlanFeature[] = [
  { label: 'Transações, categorias e relatórios', free: true, pro: true, icon: 'wallet' },
  { label: 'Importação automática das notificações do banco', free: true, pro: true, icon: 'notifications' },
  { label: 'Análise de texto com IA', free: 'Limite mensal', pro: 'Limite 300× maior', icon: 'sparkles' },
  { label: 'Exportar CSV', free: true, pro: true, icon: 'document' },
  { label: 'OCR de documentos (boletos, notas, comprovantes)', free: false, pro: true, icon: 'scan' },
  { label: 'Importação por áudio', free: false, pro: true, icon: 'mic' },
  { label: 'Previsão financeira com IA', free: false, pro: true, icon: 'trending-up' },
  { label: 'Exportar Excel e PDF', free: false, pro: true, icon: 'grid' },
  { label: 'Backups na nuvem', free: '3', pro: '30', icon: 'cloud-upload' },
];

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
    features: PLAN_FEATURES,
  },
  PRO: {
    code: 'PRO',
    name: 'Kilun Pro',
    description: 'OCR, áudio, previsão com IA, exportação premium e muito mais uso de IA',
    // Referência: o preço exibido na compra vem da Google Play (getProProductPrice)
    price: 3.00,
    priceDisplay: 'R$ 3,00',
    period: 'por mês',
    tokenLimit: Number(process.env.EXPO_PUBLIC_PRO_TOKEN_LIMIT ?? 30000000),
    color: '#f472b6',
    badge: 'PRO',
    popular: true,
    features: PLAN_FEATURES,
  },
};

/** Recursos que só o PRO tem, para a lista "o que você ganha". */
export function getProOnlyFeatures(): PlanFeature[] {
  return PLAN_FEATURES.filter((f) => f.free !== true);
}

// URLs e links para Google Play Store
export const SUBSCRIPTION_CONFIG = {
  purchaseUrl: `${BACKEND_URL}/purchase`,
  termsUrl: 'https://kilun.app/terms',
  privacyUrl: 'https://kilun.app/privacy',
  supportUrl: 'mailto:jonathas.duarte78@gmail.com',
};

// Textos para conformidade com Google Play Store
export const PLAY_STORE_TEXTS = {
  // Título e descrição do app
  appTitle: 'Kilun - Controle Financeiro',
  appShortDescription: 'Controle suas finanças com IA, exporte relatórios e tenha backup automático.',
  
  // Descrição completa para Google Play
  appFullDescription: `
O Kilun é a solução completa para controle financeiro pessoal com inteligência artificial.

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

💎 **KILUN PRO - R$ 3,00/mês**
• ${PLANS.PRO.tokenLimit.toLocaleString('pt-BR')} tokens de IA por mês (uso intensivo)
• Importação por áudio
• OCR de documentos (boleto, nota fiscal, etc.)
• Previsão financeira com IA
• Exportação em Excel e PDF
• 30 backups na nuvem

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
  subscriptionTitle: 'Kilun Pro',
  subscriptionDescription: 'OCR, áudio, previsão com IA e exportação premium',
  subscriptionPrice: 'R$ 3,00/mês',
  
  // Textos de conformidade
  autoRenewing: 'Assinatura recorrente. Cancela a qualquer momento.',
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
