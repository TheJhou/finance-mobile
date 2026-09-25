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

/**
 * Nome exibido de cada app monitorado. A lista de quais apps são capturados é a
 * do módulo nativo (MONITORED_PACKAGES em BankNotificationListenerService.kt);
 * todo pacote de lá precisa de um nome aqui.
 */
export const BANK_APPS: Record<string, string> = {
  "com.nu.production": "Nubank",
  "br.com.intermedium": "Inter",
  "com.picpay": "PicPay",
  "com.c6bank.app": "C6 Bank",
  "com.ctsi.android.app.privatelabel.c6bank": "C6 Bank",
  "com.mercadopago.wallet": "Mercado Pago",
  "com.itau": "Itaú",
  "com.itau.empresas": "Itaú Empresas",
  "com.bradesco": "Bradesco",
  "br.com.bradesco.next": "Next",
  "br.com.next": "Next",
  "com.santander.app": "Santander",
  "br.com.bb.android": "Banco do Brasil",
  "br.com.gabba.Caixa": "Caixa",
  "br.gov.caixa.tem": "Caixa Tem",
  "br.com.xp.carteira": "XP",
  "com.btg.pactual.banking": "BTG",
  "com.btg.pactual.pdigital": "BTG",
  "br.com.neon": "Neon",
  "br.com.willbank": "Will Bank",
  "com.recargapay": "RecargaPay",
  "com.ame.digital": "Ame Digital",
  "br.com.uol.ps.myaccount": "PagBank",
  "br.com.pagseguro.app": "PagBank",
  "com.google.android.apps.walletnfcrel": "Google Wallet",
  "com.samsung.android.spay": "Samsung Wallet",
  // Só capturado em builds de desenvolvimento (testes com `adb shell cmd notification post`)
  "com.android.shell": "Teste (adb)",
};

/** Carteiras de pagamento por aproximação: a compra é sempre no cartão. */
const WALLET_APPS = new Set(["Google Wallet", "Samsung Wallet"]);

// ── Exclusões ─────────────────────────────────────────────────────────

/** Nunca são transações, mesmo com valor (login, códigos, recusas, marketing). */
const ALWAYS_IGNORE_PATTERNS = [
  /login\s+realizado/i,
  /dispositivo\s+(autorizado|novo)/i,
  /(compra|transa[çc][ãa]o|pagamento|pix)\s+(recusad[oa]|negad[oa]|n[ãa]o\s+(autorizad[oa]|aprovad[oa]|realizad[oa]))/i,
  /tentativa\s+de\s+compra/i,
  /transa[çc][ãa]o\s+falhou/i,
  /erro\s+ao\s+processar/i,
  /voc[eê]\s+recebeu\s+uma\s+mensagem/i,
  /c[oó]digo\s+de\s+(seguran|verifica|autentica|acesso)/i,
  /token\s+de\s+acesso/i,
  /desconto\s+especial/i,
  /convide\s+amigos/i,
  /indique\s+e\s+ganhe/i,
  /\bganhe\b/i,
  /\baproveite\b/i,
  /confira\s+(as\s+)?ofertas/i,
  /pr[ée]-?aprovad[oa]/i,
  /\bsimule\b/i,
];

/** Lembretes de conta a pagar: só são transação se disserem que o pagamento aconteceu. */
const BILL_REMINDER_PATTERNS = [
  /fatura\s+(fecha|fechou|vence|venceu|dispon[ií]vel|aberta|est[aá])/i,
  /\bvenc(e|imento)\b/i,
  /\blembrete\b/i,
];
const COMPLETION_PATTERN = /(realizad|efetuad|aprovad|debitad|recebid|creditad|conclu[ií]d)[oa]|\bpago\b/i;

/** Costumam não ser transação; valem só quando não há verbo de transação. */
const CONTEXT_IGNORE_PATTERNS = [
  /agendad[oa]/i,
  /acesse\s+o\s+app/i,
  /novo\s+cart[aã]o\s+dispon[ií]vel/i,
  /seu\s+limite\s+(aumentou|dispon[ií]vel)/i,
  /pontua[çc][aã]o\s+de\s+cr[eé]dito/i,
  /atualize\s+seu\s+cadastro/i,
  /promo[çc][aã]o/i,
  /saldo\s+atual/i,
  /seu\s+saldo/i,
];

// ── Direção (receita ou despesa) ──────────────────────────────────────

/** Devolução de dinheiro: sempre receita. */
const REFUND_PATTERNS = [/estorn(o|ad[oa])/i, /reembols(o|ad[oa])/i];

/** Dinheiro entrando, dito de forma explícita: vence qualquer verbo de despesa. */
const RECEIPT_PATTERNS = [
  /\brecebeu\b/i,
  /\brecebid[oa]\b/i,
  /\brecebimento\b/i,
  // Sem \b no fim: no JS, \b não reconhece a fronteira depois de letra acentuada
  /para\s+voc[eê](?![a-z])/i,
  /\b(te|lhe)\s+(enviou|mandou|transferiu|pagou|fez)\b/i,
  /caiu\s+(na|em)\s+(sua\s+)?conta/i,
  /\bcreditad[oa]\b/i,
  /cr[eé]dito\s+em\s+(sua\s+)?conta/i,
];

/** Receita menos explícita: disputa com os verbos de despesa pelo que aparece primeiro. */
const WEAK_INCOME_PATTERNS = [
  /dep[oó]sito/i,
  /sal[aá]rio/i,
  /rendimento/i,
  /dividendo/i,
  /cashback/i,
  /\bganhou\b/i,
];

const EXPENSE_PATTERNS = [
  /\bcompra\b/i,
  /\bcomprou\b/i,
  /\bpagamento\b/i,
  /\bpag(ou|o|a)\b/i,
  /\benvi(ou|ad[oa])\b/i,
  /\bfez\s+(um\s+)?pix/i,
  /\btransferiu\b/i,
  /\bd[eé]bito\b/i,
  /\bdebitad[oa]\b/i,
  /\bsa(que|cou)\b/i,
  /\bboleto\b/i,
  /\bassinatura\b/i,
  /\bcobran[çc]a\b/i,
  /\bcobrad[oa]\b/i,
  /\brecarga\b/i,
  /\baproxima[çc][ãa]o\b/i,
  /\b(realizad|efetuad)[oa]\b/i,
];

type Direction = { type: TransactionType; index: number; refund: boolean };

function firstMatch(text: string, patterns: RegExp[]): number {
  let best = -1;
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

function findDirection(text: string): Direction | null {
  const refund = firstMatch(text, REFUND_PATTERNS);
  if (refund >= 0) return { type: "INCOME", index: refund, refund: true };

  const receipt = firstMatch(text, RECEIPT_PATTERNS);
  if (receipt >= 0) return { type: "INCOME", index: receipt, refund: false };

  const income = firstMatch(text, WEAK_INCOME_PATTERNS);
  const expense = firstMatch(text, EXPENSE_PATTERNS);
  if (expense >= 0 && (income < 0 || expense <= income)) return { type: "EXPENSE", index: expense, refund: false };
  if (income >= 0) return { type: "INCOME", index: income, refund: false };
  return null;
}

// ── Valores ───────────────────────────────────────────────────────────

interface MoneyMatch {
  value: number;
  index: number;
  end: number;
}

// "R$ 1.234,56", "R$1500", "R$ 1.500", "R$ 15,9"
const MONEY_WITH_SYMBOL = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?![\d.,]*\d)/gi;
// Sem "R$", só com centavos, para não confundir com final de cartão ou datas: "no valor de 89,90"
const MONEY_WITHOUT_SYMBOL = /(^|[^\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d.,]*\d)/g;
/** Valores que não são a transação: saldo, limite. */
const EXCLUDED_AMOUNT_PREFIX = /(saldo|limite|dispon[ií]vel)[^\n\d]{0,25}$/i;

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

function findAmounts(text: string): MoneyMatch[] {
  const found: MoneyMatch[] = [];
  for (const m of text.matchAll(MONEY_WITH_SYMBOL)) {
    found.push({ value: toNumber(m[1]), index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  if (found.length === 0) {
    for (const m of text.matchAll(MONEY_WITHOUT_SYMBOL)) {
      const index = (m.index ?? 0) + m[1].length;
      found.push({ value: toNumber(m[2]), index, end: index + m[2].length });
    }
  }
  return found.filter(
    (a) =>
      Number.isFinite(a.value) &&
      a.value > 0 &&
      a.value <= 999_999_999.99 &&
      !EXCLUDED_AMOUNT_PREFIX.test(text.slice(Math.max(0, a.index - 40), a.index))
  );
}

/** O valor da transação é o primeiro depois do verbo; sem nenhum depois, o mais próximo antes. */
function pickAmount(amounts: MoneyMatch[], verbIndex: number): MoneyMatch {
  return amounts.find((a) => a.index >= verbIndex) ?? amounts[amounts.length - 1];
}

// ── Estabelecimento / pessoa ──────────────────────────────────────────

const NAME_CUT =
  /\s+(?:para\s+o\s+cart|no\s+cart|com\s+o\s+cart|com\s+cart|cart[aã]o\s+final|final\s+\d|foi\s|às\s|as\s+\d|em\s+\d{1,2}\/|no\s+dia|hoje|ontem|via\s|saldo|limite|-\s)|[.;,!?:|](?:\s|$)|\n|$/i;
/** Primeiras palavras que indicam que o trecho não é um nome ("no débito", "de R$"...). */
const NOT_A_NAME = /^(?:d[eé]bito|cr[eé]dito|cart[aã]o|valor|conta|dia|compra|pix|transfer[eê]ncia|pagamento|seu|sua|voc[eê]|cashback|cupom|juros|parcela|r\$|\d)/i;
const NAME_PREPOSITION = /\b(?:em|no|na|para|a|de|do|da)\s+/gi;

function cleanName(raw: string): string | null {
  const cut = raw.split(NAME_CUT)[0]?.trim().replace(/[\s*]+$/, "");
  if (!cut || cut.length < 2 || cut.length > 60) return null;
  if (!/[A-Za-zÀ-ÿ]/.test(cut) || /R\$/i.test(cut)) return null;
  return cut;
}

function findCounterparty(text: string, amount: MoneyMatch): string | null {
  // "Fulano te enviou R$ 50" / "Maria enviou um Pix para você"
  const sender = /(?:^|\n|[.!]\s)([^\n.!]{2,60}?)\s+(?:te|lhe)\s+(?:enviou|mandou|transferiu|pagou|fez)/i.exec(text)
    ?? /(?:^|\n|[.!]\s)([^\n.!]{2,60}?)\s+(?:enviou|transferiu)\s+[^\n]*?para\s+voc[eê]/i.exec(text);
  if (sender) {
    const name = cleanName(sender[1]);
    if (name && !NOT_A_NAME.test(name)) return name;
  }

  // Depois do valor: "R$ 25,90 APROVADA em PADARIA", "R$ 50,00 para Maria", "da compra em LOJA"
  const tail = text.slice(amount.end, amount.end + 160).split("\n")[0];
  for (const m of tail.matchAll(NAME_PREPOSITION)) {
    const rest = tail.slice((m.index ?? 0) + m[0].length);
    if (NOT_A_NAME.test(rest)) continue;
    const name = cleanName(rest);
    if (name) return name;
  }

  // Antes do valor: "Pix recebido de MARIA SILVA no valor de R$ 150,00"
  const head = text.slice(0, amount.index);
  const before = /\b(?:de|para|em)\s+([^\n]{2,60}?)\s+(?:no\s+valor\s+de|valor)\s*$/i.exec(head);
  if (before) {
    const name = cleanName(before[1]);
    if (name && !NOT_A_NAME.test(name)) return name;
  }
  return null;
}

// ── Forma de pagamento e descrição ────────────────────────────────────

type Kind = "refund" | "pix" | "transfer" | "withdrawal" | "boleto" | "purchase" | "other";

function findKind(text: string, direction: Direction): Kind {
  if (direction.refund) return "refund";
  if (/\bpix\b/i.test(text)) return "pix";
  if (/\bsa(que|cou)\b/i.test(text)) return "withdrawal";
  if (/\bboleto\b/i.test(text)) return "boleto";
  if (/transfer[eê]ncia|\btransferiu\b|\bted\b|\bdoc\b/i.test(text)) return "transfer";
  if (/\bcompr(a|ou)\b|\bcart[aã]o\b|aproxima[çc][ãa]o/i.test(text)) return "purchase";
  return "other";
}

function findPaymentMethod(text: string, kind: Kind, type: TransactionType, bank: string): PaymentMethod {
  if (kind === "pix") return "PIX";
  if (kind === "withdrawal") return "CASH";
  if (kind === "boleto") return "BOLETO";
  if (kind === "transfer") return "BANK_TRANSFER";
  if (bank === "Mercado Pago" && !/cart[aã]o/i.test(text)) return "MERCADO_PAGO";
  if (/\bd[eé]bito\b/i.test(text) && !/cr[eé]dito\s+(recebido|em\s+conta)/i.test(text)) return "DEBIT_CARD";
  if (WALLET_APPS.has(bank)) return "CREDIT_CARD";
  if ((type === "EXPENSE" || kind === "refund") && (kind === "purchase" || /\bcompr(a|ou)\b|cart[aã]o|cr[eé]dito|fatura|parcel/i.test(text))) {
    return "CREDIT_CARD";
  }
  if (bank === "PicPay") return "PIX";
  if (type === "INCOME") return "BANK_TRANSFER";
  return "OTHER";
}

function describe(kind: Kind, type: TransactionType, name: string | null, text: string): string {
  const income = type === "INCOME";
  switch (kind) {
    case "refund":
      return name ? `Estorno - ${name}` : "Estorno";
    case "pix":
      return name ? `Pix ${income ? "de" : "para"} ${name}` : income ? "Pix recebido" : "Pix enviado";
    case "transfer":
      return name ? `Transferência ${income ? "de" : "para"} ${name}` : income ? "Transferência recebida" : "Transferência enviada";
    case "withdrawal":
      return "Saque";
    case "boleto":
      return name ?? "Boleto pago";
    case "purchase":
      return name ?? "Compra";
    default:
      if (name) return name;
      if (income) return /dep[oó]sito/i.test(text) ? "Depósito" : /sal[aá]rio/i.test(text) ? "Salário" : "Recebimento";
      return "Pagamento";
  }
}

/** Descrições que o parser usa quando não acha o estabelecimento ou a pessoa. */
const GENERIC_DESCRIPTIONS = new Set(
  [
    "Compra", "Pagamento", "Recebimento", "Depósito", "Salário", "Saque", "Estorno", "Boleto pago",
    "Pix recebido", "Pix enviado", "Transferência recebida", "Transferência enviada",
    "Transação", "Transação bancária", ...Object.values(BANK_APPS),
  ].map((d) => d.toLowerCase())
);

/** A descrição é só um rótulo genérico, que a IA pode melhorar. */
export function isGenericDescription(description: string): boolean {
  return GENERIC_DESCRIPTIONS.has(description.trim().toLowerCase());
}

// ── Categoria por palavras-chave ──────────────────────────────────────

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

// ── Classificação ─────────────────────────────────────────────────────

// Package name do próprio app para ignorar notificações internas
export const OWN_APP_PACKAGE = "com.thejhou.kilun";

export function isKnownBank(packageName: string): boolean {
  return packageName in BANK_APPS;
}

export function isOwnApp(packageName: string): boolean {
  return packageName === OWN_APP_PACKAGE;
}

/** Junta os campos da notificação num texto só, uma linha por campo. */
function normalize(input: NotificationInput): string {
  return [input.title, input.text, input.bigText, input.subText]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .map((part) => part.replace(/[  ]/g, " ").replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

/**
 * Resultado da interpretação de uma notificação, com o motivo quando ela não
 * vira transação. `unrecognized` = tem valor em R$ mas nenhuma regra a aceitou:
 * pode ser uma transação perdida e fica registrada para revisão.
 */
export type NotificationClassification =
  | { status: "parsed"; transaction: ParsedTransaction }
  | { status: "ignored"; reason: string }
  | { status: "unrecognized"; reason: string };

export function classifyNotification(input: NotificationInput): NotificationClassification {
  if (isOwnApp(input.packageName)) return { status: "ignored", reason: "notificação do próprio app" };

  const bank = BANK_APPS[input.packageName];
  if (!bank) return { status: "ignored", reason: `app não monitorado: ${input.packageName}` };

  const text = normalize(input);

  const always = ALWAYS_IGNORE_PATTERNS.find((p) => p.test(text));
  if (always) return { status: "ignored", reason: `regra de exclusão: /${always.source}/` };

  const reminder = BILL_REMINDER_PATTERNS.find((p) => p.test(text));
  if (reminder && !COMPLETION_PATTERN.test(text)) {
    return { status: "ignored", reason: `lembrete de conta: /${reminder.source}/` };
  }

  const amounts = findAmounts(text);
  const direction = findDirection(text);

  // Carteira (pagamento por aproximação): título = estabelecimento, texto = só o valor
  if (!direction && amounts.length > 0 && WALLET_APPS.has(bank)) {
    const merchant = cleanName(input.title);
    return {
      status: "parsed",
      transaction: {
        amount: Math.round(amounts[0].value * 100) / 100,
        description: merchant ?? "Compra",
        type: "EXPENSE",
        paymentMethod: "CREDIT_CARD",
        bank,
      },
    };
  }

  if (!direction) {
    const context = CONTEXT_IGNORE_PATTERNS.find((p) => p.test(text));
    if (amounts.length === 0) {
      return { status: "ignored", reason: context ? `regra de exclusão: /${context.source}/` : "sem valor em R$" };
    }
    return {
      status: "unrecognized",
      reason: context ? `regra de exclusão: /${context.source}/` : "valor sem verbo de transação",
    };
  }

  if (amounts.length === 0) return { status: "ignored", reason: "sem valor em R$" };

  const amount = pickAmount(amounts, direction.index);
  const kind = findKind(text, direction);
  const name = findCounterparty(text, amount);

  return {
    status: "parsed",
    transaction: {
      amount: Math.round(amount.value * 100) / 100,
      description: describe(kind, direction.type, name, text),
      type: direction.type,
      paymentMethod: findPaymentMethod(text, kind, direction.type, bank),
      bank,
    },
  };
}

/**
 * Melhor palpite para uma notificação não reconhecida, para pré-preencher a
 * revisão manual. Sem verbo de transação, supõe despesa.
 */
export function guessTransaction(rawText: string): { amount: number | null; type: TransactionType; description: string } {
  const text = rawText.replace(/[  ]/g, " ");
  const amounts = findAmounts(text);
  const direction = findDirection(text);
  if (amounts.length === 0) return { amount: null, type: direction?.type ?? "EXPENSE", description: "" };

  const amount = pickAmount(amounts, direction?.index ?? 0);
  return {
    amount: Math.round(amount.value * 100) / 100,
    type: direction?.type ?? "EXPENSE",
    description: findCounterparty(text, amount) ?? "",
  };
}

export function parseNotification(
  input: NotificationInput
): ParsedTransaction | null {
  const result = classifyNotification(input);
  return result.status === "parsed" ? result.transaction : null;
}
