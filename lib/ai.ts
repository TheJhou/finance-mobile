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
            "Você é um assistente que extrai dados de transações financeiras de fotos de recibos, comprovantes ou notificações de banco. Responda APENAS com JSON válido no formato: {\"description\": \"string\", \"amount\": number, \"type\": \"EXPENSE\" ou \"INCOME\", \"date\": \"YYYY-MM-DD\", \"categoryName\": \"string ou null\"}. Se não conseguir identificar algum campo, use null. O amount deve ser um número positivo.",
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
            "Você é um assistente que extrai dados de transações financeiras de texto livre. Procure por palavras-chave como valor (R$, R, reais), data (DD/MM, hoje, ontem), lugar/negócio, tipo de gasto (alimentação, transporte, etc) e forma de pagamento. Responda APENAS com JSON válido no formato: {\"description\": \"string\", \"amount\": number, \"type\": \"EXPENSE\" ou \"INCOME\", \"date\": \"YYYY-MM-DD\", \"categoryName\": \"string ou null\"}. Se não conseguir identificar algum campo, use null. O amount deve ser um número positivo.",
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
