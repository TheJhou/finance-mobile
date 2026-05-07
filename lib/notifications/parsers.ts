import type { PaymentMethod, TransactionType } from "@/lib/types";

export interface NotificationInput {
  packageName: string;
  title: string;
  text: string;
  bigText: string | null;
  subText: string | null;
  postTime: number;
}

export interface ParsedTransaction {
  amount: number;
  description: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  bank: string;
}

export const BANK_APPS: Record<string, string> = {
  "com.nu.production": "Nubank",
  "br.com.intermedium": "Inter",
  "com.picpay": "PicPay",
  "com.ctsi.android.app.privatelabel.c6bank": "C6 Bank",
  "com.mercadopago.wallet": "Mercado Pago",
  "com.itau": "Itaú",
  "com.itau.empresas": "Itaú Empresas",
  "com.bradesco": "Bradesco",
  "com.santander.app": "Santander",
  "br.com.bb.android": "Banco do Brasil",
  "br.com.gabba.Caixa": "Caixa",
  "br.com.xp.carteira": "XP",
  "com.btg.pactual.pdigital": "BTG",
  "br.com.neon": "Neon",
  "br.com.next": "Next",
  "br.com.willbank": "Will Bank",
  "com.recargapay": "RecargaPay",
  "com.ame.digital": "Ame Digital",
  "br.com.pagseguro.app": "PagBank",
};

// ── RAG: Notificações que NUNCA devem ser salvas ──────────────────────
const IGNORE_PATTERNS = [
  /fatura\s+(fecha|vence|vencimento)/i,
  /seu\s+boleto\s+vence/i,
  /acesse\s+o\s+app/i,
  /confira\s+ofertas/i,
  /novo\s+cart[aã]o\s+dispon[ií]vel/i,
  /seu\s+limite\s+(aumentou|dispon[ií]vel)/i,
  /pontua[çc][aã]o\s+de\s+cr[eé]dito/i,
  /atualize\s+seu\s+cadastro/i,
  /promo[çc][aã]o\s+dispon[ií]vel/i,
  // Removidos: cashback e ganhe podem ser notificações importantes de receita
  // /cashback\s+de\s+at[eé]/i,
  // /ganhe\s+at[eé]/i,
  /voc[eê]\s+recebeu\s+uma\s+mensagem/i,
  /login\s+realizado/i,
  /dispositivo\s+autorizado/i,
  /compra\s+recusada/i,
  /pagamento\s+n[aã]o\s+aprovado/i,
  /transa[çc][aã]o\s+falhou/i,
  /erro\s+ao\s+processar/i,
  /compra\s+negada/i,
  // Removido: compra cancelada pode ser importante (estorno)
  // /compra\s+cancelada/i,
  /saldo\s+atual/i,
  /seu\s+saldo/i,
  /c[oó]digo\s+de\s+(seguran|verifica|autentica)/i,
  /token\s+de\s+acesso/i,
  /cupom/i,
  /desconto\s+especial/i,
  /convide\s+amigos/i,
  /indique\s+e\s+ganhe/i,
];

function shouldIgnoreNotification(text: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(text));
}

// ── RAG: Mapeamento de palavras-chave → categoria ────────────────────
const NOTIFICATION_CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Alimentação": ["mercado", "supermercado", "padaria", "restaurante", "ifood", "lanche", "comida", "almoço", "almoco", "jantar", "açougue", "acougue", "hortifruti", "delivery", "pizzaria", "hamburger"],
  "Transporte": ["uber", "99", "combustível", "combustivel", "gasolina", "posto", "ônibus", "onibus", "metrô", "metro", "estacionamento", "pedágio", "pedagio"],
  "Moradia": ["aluguel", "condomínio", "condominio", "luz", "água", "agua", "internet", "gás", "gas", "energia", "iptu"],
  "Saúde": ["farmácia", "farmacia", "remédio", "remedio", "hospital", "consulta", "exame", "drogaria", "dentista"],
  "Educação": ["faculdade", "curso", "escola", "livro", "mensalidade", "matrícula", "matricula"],
  "Lazer": ["cinema", "show", "viagem", "hotel", "jogos", "entretenimento", "bar", "festa", "teatro"],
  "Assinaturas": ["netflix", "spotify", "amazon", "apple", "google", "disney", "hbo", "youtube", "assinatura", "deezer"],
  "Compras": ["loja", "shopping", "magazine", "americanas", "shopee", "mercado livre", "shein", "roupa"],
  "Transferência": ["pix", "ted", "doc", "transferência", "transferencia"],
};

export function inferCategoryFromText(text: string): string | null {
  const lower = text.toLowerCase();

  // Exclusões: se o texto contém termos bancários/genéricos, evitar categorias específicas
  const bankTerms = /\b(banco|transferência|transferencia|pix|pagamento|comprovante|ted|doc|recebido|enviado|debitado|creditado)\b/i;
  const isBankContext = bankTerms.test(lower);

  // Score por categoria
  const categoryScores: Map<string, number> = new Map();

  for (const [cat, keywords] of Object.entries(NOTIFICATION_CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        let score = 1;
        // Keywords mais específicas têm peso maior
        if (kw.includes(" ")) score = 3;
        else if (kw.length > 6) score = 2;

        // Penalizar se é contexto bancário e a categoria é de consumo
        if (isBankContext && ["Alimentação", "Transporte", "Lazer", "Compras"].includes(cat)) {
          score = score * 0.3;
        }

        // "mercado" sozinho é muito genérico
        if (kw === "mercado" && isBankContext) {
          score = 0.1;
        }

        categoryScores.set(cat, (categoryScores.get(cat) || 0) + score);
      }
    }
  }

  // Encontrar categoria com maior score
  let bestCat: string | null = null;
  let bestScore = 0;
  for (const [cat, score] of categoryScores) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  // Só retornar se score mínimo for atingido
  if (bestScore >= 2) return bestCat;

  // Se é contexto bancário e nada bateu forte, retornar Transferência
  if (isBankContext) return "Transferência";

  return null;
}

// Package name do próprio app para ignorar notificações internas
export const OWN_APP_PACKAGE = "com.thejhou.financeapp";

export function isKnownBank(packageName: string): boolean {
  return packageName in BANK_APPS;
}

export function isOwnApp(packageName: string): boolean {
  return packageName === OWN_APP_PACKAGE;
}

function parseAmount(source: string): number | null {
  // Primary: with decimals (Brazilian format: 1.234,56 or 45,90)
  let match = source.match(
    /R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/
  );
  if (match) {
    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalized);
    if (!isNaN(num) && isFinite(num) && num > 0) return num;
  }
  // Fallback: integer values (rare but possible, e.g., "R$ 100")
  match = source.match(/R\$\s*(\d+)(?!\d*[.,])/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && isFinite(num) && num > 0) return num;
  }
  return null;
}

type PartialParsed = Omit<ParsedTransaction, "bank">;

function parseNubank(input: NotificationInput): PartialParsed | null {
  if (input.packageName !== "com.nu.production") return null;
  const text = [input.title, input.text, input.bigText]
    .filter(Boolean)
    .join(" ");

  let m = text.match(
    /Compra\s+aprovada(?:\s+de)?\s+R\$\s*([\d.,]+)\s+(?:em|no|na)\s+(.+?)(?:\.|$)/i
  );
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2].trim(),
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  // Adicionado: capturar compras sem especificar o local
  m = text.match(/Compra\s+aprovada\s+de\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Compra",
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  // Adicionado: capturar pagamentos de cartão
  m = text.match(/Pagamento\s+de\s+R\$\s*([\d.,]+)\s+(?:em|no|na)\s+(.+?)(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2].trim(),
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  m = text.match(
    /Voc[êe]\s+recebeu\s+(?:um\s+)?Pix\s+de\s+R\$\s*([\d.,]+)\s+de\s+(.+?)(?:\.|$)/i
  );
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: `Pix de ${m[2].trim()}`,
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  m = text.match(
    /Voc[êe]\s+enviou\s+(?:um\s+)?Pix\s+de\s+R\$\s*([\d.,]+)\s+para\s+(.+?)(?:\.|$)/i
  );
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: `Pix para ${m[2].trim()}`,
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pix sem especificar destinatário
  m = text.match(/Voc[êe]\s+enviou\s+(?:um\s+)?Pix\s+de\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pix enviado",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  m = text.match(/transfer[êe]ncia\s+recebida[^R]*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Transferência recebida",
        type: "INCOME",
        paymentMethod: "BANK_TRANSFER",
      };
  }

  // Adicionado: capturar transferências enviadas
  m = text.match(/transfer[êe]ncia\s+enviada[^R]*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Transferência enviada",
        type: "EXPENSE",
        paymentMethod: "BANK_TRANSFER",
      };
  }

  return null;
}

function parseInter(input: NotificationInput): PartialParsed | null {
  if (input.packageName !== "br.com.intermedium") return null;
  const text = [input.title, input.text, input.bigText]
    .filter(Boolean)
    .join(" ");

  let m = text.match(/Pix\s+recebido:?\s*R\$\s*([\d.,]+)(?:\s+de\s+(.+?))?(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2] ? `Pix de ${m[2].trim()}` : "Pix recebido",
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pix recebido sem especificar origem
  m = text.match(/Pix\s+recebido:?\s*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pix recebido",
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  m = text.match(/Pix\s+enviado:?\s*R\$\s*([\d.,]+)(?:\s+para\s+(.+?))?(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2] ? `Pix para ${m[2].trim()}` : "Pix enviado",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pix enviado sem especificar destinatário
  m = text.match(/Pix\s+enviado:?\s*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pix enviado",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  m = text.match(/Compra\s+(?:aprovada|no\s+cart[ãa]o)[^R]*R\$\s*([\d.,]+)\s+(?:em|no|na)\s+(.+?)(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2].trim(),
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  // Adicionado: capturar compras sem especificar local
  m = text.match(/Compra\s+(?:aprovada|no\s+cart[ãa]o)[^R]*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Compra",
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  // Adicionado: capturar pagamentos
  m = text.match(/Pagamento\s+realizado[^R]*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pagamento",
        type: "EXPENSE",
        paymentMethod: "DEBIT_CARD",
      };
  }

  return null;
}

function parsePicPay(input: NotificationInput): PartialParsed | null {
  if (input.packageName !== "com.picpay") return null;
  const text = [input.title, input.text, input.bigText]
    .filter(Boolean)
    .join(" ");

  let m = text.match(/Voc[êe]\s+recebeu\s+R\$\s*([\d.,]+)\s+de\s+(.+?)(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: `PicPay de ${m[2].trim()}`,
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pix recebido sem especificar origem
  m = text.match(/Voc[êe]\s+recebeu\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pix recebido",
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  m = text.match(/Voc[êe]\s+pagou\s+R\$\s*([\d.,]+)\s+(?:a|para)\s+(.+?)(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: `PicPay para ${m[2].trim()}`,
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pagamento sem especificar destinatário
  m = text.match(/Voc[êe]\s+pagou\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pagamento PicPay",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pagamentos em geral
  m = text.match(/Pagamento\s+de\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pagamento",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  return null;
}

function parseC6(input: NotificationInput): PartialParsed | null {
  if (input.packageName !== "com.ctsi.android.app.privatelabel.c6bank") return null;
  const text = [input.title, input.text, input.bigText]
    .filter(Boolean)
    .join(" ");

  let m = text.match(/Compra\s+de\s+R\$\s*([\d.,]+)\s+(?:em|no|na)\s+(.+?)(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2].trim(),
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  // Adicionado: capturar compras sem especificar local
  m = text.match(/Compra\s+de\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Compra",
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
      };
  }

  m = text.match(/Pix\s+recebido.*?R\$\s*([\d.,]+)(?:\s+de\s+(.+?))?(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2] ? `Pix de ${m[2].trim()}` : "Pix recebido",
        type: "INCOME",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pix enviado
  m = text.match(/Pix\s+enviado.*?R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pix enviado",
        type: "EXPENSE",
        paymentMethod: "PIX",
      };
  }

  // Adicionado: capturar pagamentos
  m = text.match(/Pagamento\s+de\s+R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: "Pagamento",
        type: "EXPENSE",
        paymentMethod: "DEBIT_CARD",
      };
  }

  return null;
}

function parseMercadoPago(input: NotificationInput): PartialParsed | null {
  if (input.packageName !== "com.mercadopago.wallet") return null;
  const text = [input.title, input.text, input.bigText]
    .filter(Boolean)
    .join(" ");

  let m = text.match(/Pagamento\s+(?:de\s+)?R\$\s*([\d.,]+)(?:\s+(?:para|a|no|na)\s+(.+?))?(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2] ? m[2].trim() : "Pagamento Mercado Pago",
        type: "EXPENSE",
        paymentMethod: "MERCADO_PAGO",
      };
  }

  m = text.match(/Voc[eê]\s+recebeu\s+R\$\s*([\d.,]+)(?:\s+de\s+(.+?))?(?:\.|$)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: m[2] ? `Recebido de ${m[2].trim()}` : "Recebido Mercado Pago",
        type: "INCOME",
        paymentMethod: "MERCADO_PAGO",
      };
  }

  m = text.match(/Transfer[eê]ncia\s+(?:enviada|recebida)[^R]*R\$\s*([\d.,]+)/i);
  if (m) {
    const amount = parseAmount(m[1]);
    if (amount)
      return {
        amount,
        description: text.match(/recebida/i) ? "Transferência recebida" : "Transferência enviada",
        type: text.match(/recebida/i) ? "INCOME" : "EXPENSE",
        paymentMethod: "MERCADO_PAGO",
      };
  }

  return null;
}

function parseGeneric(input: NotificationInput): PartialParsed | null {
  const text = [input.title, input.text, input.bigText, input.subText]
    .filter(Boolean)
    .join(" | ");

  const amount = parseAmount(text);
  if (!amount) return null;

  // RAG: Termos de despesa (expandido)
  const expensePatterns = [
    /pix\s+enviado/i,
    /pix\s+transferido/i,
    /voc[eê]\s+enviou\s+um?\s+pix/i,
    /transfer[eê]ncia\s+via\s+pix\s+enviada/i,
    /pagamento\s+realizado/i,
    /compra\s+aprovada/i,
    /compra\s+no\s+d[ée]bito/i,
    /compra\s+no\s+cr[ée]dito/i,
    /transfer[êe]ncia\s+enviada/i,
    /transfer[eê]ncia\s+realizada/i,
    /d[ée]bito\s+realizado/i,
    /boleto\s+pago/i,
    /saque\s+realizado/i,
    /voc[eê]\s+pagou/i,
    /foi\s+pago/i,
    /cr[eé]dito\s+aprovado/i,
    /assinatura\s+cobrada/i,
    /recarga\s+realizada/i,
    /cobran[cç]a/i,
    /pagamento\s+via\s+pix/i,
    /pagamento\s+da\s+fatura.*realizado/i,
    /debitado/i,
    /estornou/i,  // estorno pode ser receita ou despesa, mas geralmente é despesa cancelada
    /cancelou/i,
    /descontou/i,
    /retirou/i,
    /saiu/i,
    /enviou/i,
    /transferiu/i,
  ];

  // RAG: Termos de receita (expandido)
  const incomePatterns = [
    /pix\s+recebido/i,
    /pix\s+transferido\s+para\s+voc[eê]/i,
    /voc[eê]\s+recebeu\s+um?\s+pix/i,
    /transfer[eê]ncia\s+via\s+pix\s+recebida/i,
    /transfer[êe]ncia\s+recebida/i,
    /dep[óo]sito\s+recebido/i,
    /cr[ée]dito\s+recebido/i,
    /pagamento\s+recebido/i,
    /valor\s+recebido/i,
    /dinheiro\s+recebido/i,
    /voc[eê]\s+recebeu/i,
    /recebimento/i,
    /sal[aá]rio/i,
    /estorno\s+recebido/i,
    /reembolso\s+recebido/i,
    /cashback\s+recebido/i,
    /foi\s+depositado/i,
    /recebeu\s+um\s+pix/i,
    /entrada/i,
    /rendimento/i,
    /dividendo/i,
    /recebeu/i,
    /creditado/i,
  ];

  const isExpense = expensePatterns.some(pattern => pattern.test(text));
  const isIncome = incomePatterns.some(pattern => pattern.test(text));

  // Se não consegue determinar, assume EXPENSE (mais comum em notificações de bancos)
  const type: TransactionType = isIncome && !isExpense ? "INCOME" : "EXPENSE";

  // RAG: Inferência de método de pagamento
  let paymentMethod: PaymentMethod = "OTHER";
  if (/pix/i.test(text)) paymentMethod = "PIX";
  else if (/mercado\s*pago|mercadopago/i.test(text)) paymentMethod = "MERCADO_PAGO";
  else if (/d[eé]bito|no\s+d[eé]bito|cart[aã]o\s+de\s+d[eé]bito/i.test(text)) paymentMethod = "DEBIT_CARD";
  else if (/cr[eé]dito|cart[aã]o\s+de\s+cr[eé]dito|compra\s+aprovada|parcel/i.test(text)) paymentMethod = "CREDIT_CARD";
  else if (/transfer[eê]ncia|ted|doc/i.test(text)) paymentMethod = "BANK_TRANSFER";
  else if (/boleto/i.test(text)) paymentMethod = "OTHER";
  else if (/dinheiro|esp[eé]cie|saque/i.test(text)) paymentMethod = "CASH";

  const description =
    input.title?.trim() ||
    input.text?.slice(0, 60).trim() ||
    "Transação bancária";

  return { amount, description, type, paymentMethod };
}

const PARSERS: Array<(input: NotificationInput) => PartialParsed | null> = [
  parseNubank,
  parseInter,
  parsePicPay,
  parseC6,
  parseMercadoPago,
  parseGeneric,
];

export function parseNotification(
  input: NotificationInput
): ParsedTransaction | null {
  // Ignorar notificações do próprio app
  if (isOwnApp(input.packageName)) {
    return null;
  }

  // Filtrar apenas apps permitidos
  const bank = BANK_APPS[input.packageName];
  if (!bank) {
    return null;
  }

  // RAG: Verificar se é notificação que deve ser ignorada
  const fullText = [input.title, input.text, input.bigText, input.subText]
    .filter(Boolean)
    .join(" ");
  if (shouldIgnoreNotification(fullText)) {
    return null;
  }

  for (const parser of PARSERS) {
    const result = parser(input);
    if (result) {
      return { ...result, bank };
    }
  }

  return null;
}
