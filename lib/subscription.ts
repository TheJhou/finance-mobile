import { authFetch } from "@/lib/auth";
import { ApiError } from "@/lib/backend";
import { BACKEND_URL } from "@/lib/config";
import type { SubscriptionStatus } from "@/lib/types";

async function handleSubscriptionError(response: Response): Promise<never> {
  let msg = "Erro ao consultar plano";
  let code: string | undefined;
  
  try {
    const error = await response.json();
    msg = error.error || error.message || msg;
    code = error.code;
    if (error.details) msg += ` — ${error.details}`;
  } catch {}

  if (code === "TOKEN_LIMIT_EXCEEDED") {
    msg = "Você atingiu o limite mensal de uso da IA. Atualize para o plano Pro para continuar.";
  }

  throw new ApiError(msg, response.status, code);
}

/** Consulta o plano no backend; lança em falha de rede (sem fallback). */
async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await authFetch(`${BACKEND_URL}/subscription/status`);
  if (!response.ok) {
    await handleSubscriptionError(response);
  }
  return response.json();
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    return await fetchSubscriptionStatus();
  } catch (error) {
    // If it's an ApiError, re-throw it
    if (error instanceof ApiError) {
      throw error;
    }
    
    // For network errors or other issues, return a default free plan status
    console.warn("[Subscription] API unavailable, returning default free plan:", error);
    return {
      plan: {
        code: "FREE",
        name: "Grátis",
        tokenLimit: Number(process.env.EXPO_PUBLIC_FREE_TOKEN_LIMIT ?? 100000),
      },
      usage: {
        used: 0,
        limit: Number(process.env.EXPO_PUBLIC_FREE_TOKEN_LIMIT ?? 100000),
        remaining: Number(process.env.EXPO_PUBLIC_FREE_TOKEN_LIMIT ?? 100000),
        period: "monthly",
        resetsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }
}

let cachedIsPro: boolean | null = null;

export async function isProUser(): Promise<boolean> {
  if (cachedIsPro !== null) return cachedIsPro;
  try {
    // Sem o fallback "FREE" de getSubscriptionStatus: uma falha de rede não
    // pode ficar em cache e tratar um assinante como FREE até reiniciar o app
    const status = await fetchSubscriptionStatus();
    cachedIsPro = status.plan.code === "PRO";
    return cachedIsPro;
  } catch {
    return false;
  }
}

export function clearProCache(): void {
  cachedIsPro = null;
}

export async function checkProFeature(featureName: string): Promise<boolean> {
  const isPro = await isProUser();
  if (!isPro) {
    console.info(`[Subscription] Feature "${featureName}" bloqueada - usuário FREE`);
    return false;
  }
  console.info(`[Subscription] Feature "${featureName}" liberada - usuário PRO`);
  return true;
}
