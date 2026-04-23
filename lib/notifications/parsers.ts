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
};

export function isKnownBank(packageName: string): boolean {
  return packageName in BANK_APPS;
}

function parseAmount(source: string): number | null {
  const match = source.match(/R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2}|[\d]+,\d{2})/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
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

  return null;
}

function parseGeneric(input: NotificationInput): PartialParsed | null {
  const text = [input.title, input.text, input.bigText, input.subText]
    .filter(Boolean)
    .join(" | ");

  const amount = parseAmount(text);
  if (!amount) return null;

  const isIncome = /recebeu|recebido|cr[ée]dito|entrada/i.test(text);
  const isExpense = /compra|pagou|pagamento|enviou|d[ée]bito|sa[íi]da|paga/i.test(text);

  const type: TransactionType =
    isIncome && !isExpense ? "INCOME" : "EXPENSE";

  const isPix = /pix/i.test(text);
  const isCard = /cart[ãa]o|compra/i.test(text);
  const paymentMethod: PaymentMethod = isPix
    ? "PIX"
    : isCard
    ? "CREDIT_CARD"
    : "OTHER";

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
  parseGeneric,
];

export function parseNotification(
  input: NotificationInput
): ParsedTransaction | null {
  const bank = BANK_APPS[input.packageName];
  if (!bank) return null;

  for (const parser of PARSERS) {
    const result = parser(input);
    if (result) return { ...result, bank };
  }
  return null;
}
