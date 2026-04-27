import { getDb } from "@/lib/db";

interface ExtractedTransaction {
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  categoryName: string | null;
}

async function getApiKey(): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'openai_api_key'"
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('openai_api_key', ?)",
    [key]
  );
}

export async function getStoredApiKey(): Promise<string | null> {
  return getApiKey();
}

export async function extractTransactionFromPhoto(
  base64Image: string,
  mimeType: string
): Promise<ExtractedTransaction> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key da OpenAI não configurada. Configure nas configurações.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `Você é um assistente especializado em extrair dados de transações financeiras de fotos de recibos, comprovantes ou notificações de banco.

REGRAS FUNDAMENTAIS:
1. NUNCA classificar apenas por valor monetário. A presença de R$ não significa transação.
2. IGNORAR: recibo gerado, comprovante disponível, boleto gerado, fatura fechada, limite alterado, promoção, cashback disponível, login, senha alterada.
3. Se houver dúvida entre registrar ou ignorar, PREFERIR IGNORAR.

DESPESSA (saída de dinheiro):
- Palavras-chave: gastei, paguei, comprei, compra aprovada, pagamento realizado, pix enviado, transferência enviada, boleto pago, débito realizado, saque realizado.

RECEITA (entrada de dinheiro):
- Palavras-chave: recebi, pix recebido, transferência recebida, depósito recebido, caiu na conta, salário, pagamento recebido, valor recebido, crédito recebido, reembolso recebido, cashback recebido.

CATEGORIAS DE DESPESA:
- Alimentação: mercado, supermercado, restaurante, padaria, delivery, iFood, Uber Eats.
- Transporte: uber, 99, taxi, gasolina, combustível, estacionamento, pedágio, bilhete único.
- Moradia: aluguel, condomínio, luz, água, internet, energia, gás.
- Saúde: farmácia, remédio, médico, dentista, consulta, plano de saúde.
- Educação: faculdade, escola, curso, mensalidade, livro.
- Lazer: cinema, Netflix, Spotify, streaming, jogos.
- Tecnologia: celular, notebook, software, hospedagem, servidor.
- Serviços: academia, assinatura, plano recorrente.

CATEGORIAS DE RECEITA:
- Salário: salário, pagamento do trabalho, holerite.
- Pix recebido: pix recebido, transferência pix recebida.
- Transferência recebida: TED, DOC, depósito recebido.
- Freelance: freela, cliente pagou, serviço pago.
- Reembolso: estorno recebido, valor devolvido.
- Cashback: cashback recebido (diferente de disponível).
- Venda: vendi, venda realizada.

FORMAS DE PAGAMENTO:
- pix: pix, chave pix
- credito: cartão de crédito, fatura, compra no crédito
- debito: cartão de débito, compra no débito, debitado
- boleto: boleto pago, código de barras
- dinheiro: em espécie, saquei
- transferencia: TED, DOC, transferência bancária

NORMALIZAÇÃO DE VALORES:
- Reconhecer formatos brasileiros: R$ 50,00, R$ 1.250,75, 100 reais, 1.250,75
- Converter para número decimal: R$ 1.250,75 -> 1250.75
- Sempre retornar valor positivo, usar campo type para definir despesa/receita.

DATA:
- Extrair data da transação se disponível
- Formato YYYY-MM-DD
- Se não identificar, usar data atual

VENCIMENTO:
- Se houver data de vencimento, incluir na descrição

RESPOSTA:
Responda APENAS com JSON válido no formato: {"description": "string", "amount": number, "type": "EXPENSE" ou "INCOME", "date": "YYYY-MM-DD", "categoryName": "string ou null"}. Se não conseguir identificar algum campo, use null. O amount deve ser um número positivo.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: "text",
              text: "Extraia os dados da transação financeira desta imagem.",
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Erro na API OpenAI: ${response.status} - ${errBody}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Não foi possível interpretar a resposta da IA");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    description: parsed.description ?? "",
    amount: typeof parsed.amount === "number" ? Math.abs(parsed.amount) : 0,
    type: parsed.type === "INCOME" ? "INCOME" : "EXPENSE",
    date: parsed.date ?? new Date().toISOString().slice(0, 10),
    categoryName: parsed.categoryName ?? null,
  };
}

export async function extractTransactionFromText(
  text: string
): Promise<ExtractedTransaction> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key da OpenAI não configurada. Configure nas configurações.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `Você é um assistente especializado em extrair dados de transações financeiras de texto livre.

REGRAS FUNDAMENTAIS:
1. NUNCA classificar apenas por valor monetário. A presença de R$ não significa transação.
2. IGNORAR: recibo gerado, comprovante disponível, boleto gerado, fatura fechada, limite alterado, promoção, cashback disponível, login, senha alterada.
3. Se houver dúvida entre registrar ou ignorar, PREFERIR IGNORAR.

DESPESSA (saída de dinheiro):
- Palavras-chave: gastei, paguei, comprei, compra aprovada, pagamento realizado, pix enviado, transferência enviada, boleto pago, débito realizado, saque realizado, saiu da conta, foi debitado, descontou.

RECEITA (entrada de dinheiro):
- Palavras-chave: recebi, pix recebido, transferência recebida, depósito recebido, caiu na conta, salário, pagamento recebido, valor recebido, crédito recebido, reembolso recebido, cashback recebido, ganhei.

CATEGORIAS DE DESPESA:
- Alimentação: mercado, supermercado, restaurante, padaria, delivery, iFood, Uber Eats, comida, bebida.
- Transporte: uber, 99, taxi, gasolina, combustível, estacionamento, pedágio, bilhete único, onibus, metro.
- Moradia: aluguel, condomínio, luz, água, internet, energia, gás, conta de casa.
- Saúde: farmácia, remédio, médico, dentista, consulta, plano de saúde, hospital.
- Educação: faculdade, escola, curso, mensalidade, livro, curso online.
- Lazer: cinema, Netflix, Spotify, streaming, jogos, show, festa.
- Tecnologia: celular, notebook, software, hospedagem, servidor, api.
- Serviços: academia, assinatura, plano recorrente, barbeiro.
- Impostos: IPVA, IPTU, imposto de renda, multa, taxa.
- Dívidas: empréstimo, parcela do empréstimo, financiamento.

CATEGORIAS DE RECEITA:
- Salário: salário, pagamento do trabalho, holerite, ordenado.
- Pix recebido: pix recebido, transferência pix recebida.
- Transferência recebida: TED, DOC, depósito recebido, valor creditado.
- Freelance: freela, cliente pagou, serviço pago, job.
- Reembolso: estorno recebido, valor devolvido, devolução recebida.
- Cashback: cashback recebido (diferente de disponível).
- Venda: vendi, venda realizada, recebi pela venda.

FORMAS DE PAGAMENTO:
- pix: pix, chave pix
- credito: cartão de crédito, fatura, compra no crédito
- debito: cartão de débito, compra no débito, debitado
- boleto: boleto pago, código de barras
- dinheiro: em espécie, saquei
- transferencia: TED, DOC, transferência bancária

NORMALIZAÇÃO DE VALORES:
- Reconhecer formatos brasileiros: R$ 50,00, R$ 1.250,75, 100 reais, 1.250,75
- Converter para número decimal: R$ 1.250,75 -> 1250.75
- Sempre retornar valor positivo, usar campo type para definir despesa/receita.

DATA:
- Extrair data da transação se disponível (hoje, ontem, DD/MM, DD/MM/AAAA)
- Formato YYYY-MM-DD
- Se não identificar, usar data atual

VENCIMENTO:
- Se houver data de vencimento (vence, vencimento), incluir na descrição

RESPOSTA:
Responda APENAS com JSON válido no formato: {"description": "string", "amount": number, "type": "EXPENSE" ou "INCOME", "date": "YYYY-MM-DD", "categoryName": "string ou null"}. Se não conseguir identificar algum campo, use null. O amount deve ser um número positivo.`,
        },
        {
          role: "user",
          content: `Extraia os dados da transação financeira deste texto: "${text}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Erro na API OpenAI: ${response.status} - ${errBody}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Não foi possível interpretar a resposta da IA");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    description: parsed.description ?? text.substring(0, 50),
    amount: typeof parsed.amount === "number" ? Math.abs(parsed.amount) : 0,
    type: parsed.type === "INCOME" ? "INCOME" : "EXPENSE",
    date: parsed.date ?? new Date().toISOString().slice(0, 10),
    categoryName: parsed.categoryName ?? null,
  };
}
