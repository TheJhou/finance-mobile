/**
 * Exemplos de notificações bancárias e o resultado esperado do parser.
 * Para cada formato novo visto em "Não reconhecidas", adicione um caso aqui
 * (com nomes e valores trocados) antes de ajustar as regras.
 */
import { classifyNotification } from "@/lib/notifications/parsers";

interface Fixture {
  name: string;
  pkg: string;
  title: string;
  text: string;
  bigText?: string;
  expected:
    | { status: "parsed"; amount: number; type: "INCOME" | "EXPENSE"; paymentMethod: string; description: string }
    | { status: "ignored" | "unrecognized" };
}

const FIXTURES: Fixture[] = [
  // ── Casos que o parser antigo perdia ou errava ──
  {
    name: "compra no débito com saldo no fim",
    pkg: "com.itau",
    title: "Itaú",
    text: "Compra de R$ 50,00 no débito em POSTO SHELL. Seu saldo disponível é R$ 1.200,00",
    expected: { status: "parsed", amount: 50, type: "EXPENSE", paymentMethod: "DEBIT_CARD", description: "POSTO SHELL" },
  },
  {
    name: "Pix recebido com saldo no fim",
    pkg: "br.com.bb.android",
    title: "BB",
    text: "Pix de R$ 150,00 recebido de MARIA SILVA. Saldo atual R$ 900,00",
    expected: { status: "parsed", amount: 150, type: "INCOME", paymentMethod: "PIX", description: "Pix de MARIA SILVA" },
  },
  {
    name: "transferência sem centavos",
    pkg: "com.santander.app",
    title: "Santander",
    text: "Transferência de R$ 1.500 realizada",
    expected: { status: "parsed", amount: 1500, type: "EXPENSE", paymentMethod: "BANK_TRANSFER", description: "Transferência enviada" },
  },
  {
    name: "compra com cupom no texto",
    pkg: "br.com.intermedium",
    title: "Inter",
    text: "Compra de R$ 99,90 aprovada no cartão com cupom de cashback",
    expected: { status: "parsed", amount: 99.9, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "Compra" },
  },
  {
    name: "Pix recebido de terceiro ('te enviou')",
    pkg: "com.itau",
    title: "Itaú",
    text: "Fulano de Tal te enviou um Pix de R$ 200,00",
    expected: { status: "parsed", amount: 200, type: "INCOME", paymentMethod: "PIX", description: "Pix de Fulano de Tal" },
  },
  {
    name: "estorno é receita",
    pkg: "com.nu.production",
    title: "Estorno",
    text: "O estorno de R$ 30,00 da compra em LOJA X foi realizado",
    expected: { status: "parsed", amount: 30, type: "INCOME", paymentMethod: "CREDIT_CARD", description: "Estorno - LOJA X" },
  },
  {
    name: "Pix enviado sem o nome do banco na descrição",
    pkg: "com.bradesco",
    title: "Bradesco",
    text: "Você fez um Pix de R$ 80,00 para JOAO",
    expected: { status: "parsed", amount: 80, type: "EXPENSE", paymentMethod: "PIX", description: "Pix para JOAO" },
  },
  {
    name: "compra com final do cartão antes do valor e limite no fim",
    pkg: "com.bradesco",
    title: "Bradesco Cartões",
    text: "Compra aprovada no cartão final 1234 de R$ 45,00 em MERCADO BOM. Limite disponível R$ 3.000,00",
    expected: { status: "parsed", amount: 45, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "MERCADO BOM" },
  },
  {
    name: "Nubank: 'APROVADA em' depois do valor",
    pkg: "com.nu.production",
    title: "Compra aprovada",
    text: "Compra de R$ 25,90 APROVADA em PADARIA PAO QUENTE para o cartão com final 1234.",
    expected: { status: "parsed", amount: 25.9, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "PADARIA PAO QUENTE" },
  },

  // ── Outros formatos ──
  {
    name: "valor sem espaço depois do R$",
    pkg: "com.picpay",
    title: "PicPay",
    text: "Você pagou R$12,00 para Ana Souza",
    expected: { status: "parsed", amount: 12, type: "EXPENSE", paymentMethod: "PIX", description: "Ana Souza" },
  },
  {
    name: "pagamento recebido não é despesa",
    pkg: "com.mercadopago.wallet",
    title: "Mercado Pago",
    text: "Pagamento recebido de R$ 75,50 de Carlos",
    expected: { status: "parsed", amount: 75.5, type: "INCOME", paymentMethod: "MERCADO_PAGO", description: "Carlos" },
  },
  {
    name: "Pix recebido com nome antes do valor",
    pkg: "br.com.gabba.Caixa",
    title: "CAIXA",
    text: "Pix recebido de JOSE PEREIRA no valor de R$ 1.234,56",
    expected: { status: "parsed", amount: 1234.56, type: "INCOME", paymentMethod: "PIX", description: "Pix de JOSE PEREIRA" },
  },
  {
    name: "saque",
    pkg: "br.com.bb.android",
    title: "BB",
    text: "Saque de R$ 200,00 realizado no terminal",
    expected: { status: "parsed", amount: 200, type: "EXPENSE", paymentMethod: "CASH", description: "Saque" },
  },
  {
    name: "boleto pago",
    pkg: "br.com.intermedium",
    title: "Inter",
    text: "Boleto de R$ 320,10 pago com sucesso",
    expected: { status: "parsed", amount: 320.1, type: "EXPENSE", paymentMethod: "BOLETO", description: "Boleto pago" },
  },
  {
    name: "pagamento da fatura realizado",
    pkg: "com.nu.production",
    title: "Nubank",
    text: "Pagamento da fatura de R$ 500,00 realizado",
    expected: { status: "parsed", amount: 500, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "Pagamento" },
  },
  {
    name: "salário",
    pkg: "com.itau",
    title: "Itaú",
    text: "Salário de R$ 3.500,00 caiu na sua conta",
    expected: { status: "parsed", amount: 3500, type: "INCOME", paymentMethod: "BANK_TRANSFER", description: "Salário" },
  },
  {
    name: "compra por aproximação na carteira",
    pkg: "com.google.android.apps.walletnfcrel",
    title: "PADARIA CENTRAL",
    text: "R$ 18,50 com Visa •••• 1234",
    expected: { status: "parsed", amount: 18.5, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "PADARIA CENTRAL" },
  },
  {
    name: "conteúdo só nas linhas do bigText",
    pkg: "com.nu.production",
    title: "Nubank",
    text: "2 novas notificações",
    bigText: "Compra aprovada de R$ 10,00 em CAFE\nCompra aprovada de R$ 20,00 em LOJA",
    expected: { status: "parsed", amount: 10, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "CAFE" },
  },
  {
    name: "espaço inseparável depois do R$",
    pkg: "com.nu.production",
    title: "Nubank",
    text: "Compra aprovada de R$ 42,00 em FARMACIA",
    expected: { status: "parsed", amount: 42, type: "EXPENSE", paymentMethod: "CREDIT_CARD", description: "FARMACIA" },
  },

  // ── Não são transações ──
  { name: "saldo sozinho", pkg: "com.itau", title: "Itaú", text: "Seu saldo atual é R$ 1.234,56", expected: { status: "ignored" } },
  { name: "compra recusada", pkg: "com.nu.production", title: "Nubank", text: "Compra recusada de R$ 99,00 em LOJA", expected: { status: "ignored" } },
  { name: "compra não autorizada", pkg: "com.itau", title: "Itaú", text: "Compra não autorizada de R$ 10,00", expected: { status: "ignored" } },
  { name: "lembrete de fatura", pkg: "com.nu.production", title: "Nubank", text: "Sua fatura de R$ 500,00 vence amanhã", expected: { status: "ignored" } },
  { name: "lembrete com a palavra pagamento", pkg: "com.itau", title: "Itaú", text: "Lembrete: o pagamento de R$ 89,00 vence hoje", expected: { status: "ignored" } },
  { name: "crédito pré-aprovado", pkg: "com.itau", title: "Itaú", text: "Você tem R$ 5.000,00 de crédito pré-aprovado", expected: { status: "ignored" } },
  { name: "promoção com valor", pkg: "com.picpay", title: "PicPay", text: "Ganhe R$ 20,00 de cashback na sua primeira compra", expected: { status: "ignored" } },
  { name: "limite aumentou", pkg: "com.nu.production", title: "Nubank", text: "Seu limite aumentou para R$ 3.000,00", expected: { status: "ignored" } },
  { name: "código de segurança", pkg: "com.itau", title: "Itaú", text: "Seu código de segurança é 123456", expected: { status: "ignored" } },
  { name: "Pix agendado sem valor", pkg: "com.itau", title: "Itaú", text: "Você tem um Pix agendado para amanhã", expected: { status: "ignored" } },

  // ── Ambíguos: vão para revisão ──
  { name: "valor sem verbo", pkg: "com.itau", title: "Itaú", text: "Movimentação de R$ 50,00 na conta", expected: { status: "unrecognized" } },
];

describe("parser — fixtures", () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, fixture) => {
    const result = classifyNotification({
      packageName: fixture.pkg,
      title: fixture.title,
      text: fixture.text,
      bigText: fixture.bigText ?? null,
      subText: null,
      postTime: 1_719_064_800_000,
    });

    const { expected } = fixture;
    if (expected.status !== "parsed") {
      expect(result.status).toBe(expected.status);
      return;
    }
    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;
    expect({
      amount: result.transaction.amount,
      type: result.transaction.type,
      paymentMethod: result.transaction.paymentMethod,
      description: result.transaction.description,
    }).toEqual({
      amount: expected.amount,
      type: expected.type,
      paymentMethod: expected.paymentMethod,
      description: expected.description,
    });
  });
});
