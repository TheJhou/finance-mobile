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

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const response = await authFetch(`${BACKEND_URL}/subscription/status`);

    if (!response.ok) {
      await handleSubscriptionError(response);
    }

    return response.json();
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
        tokenLimit: 50,
      },
      usage: {
        used: 0,
        limit: 50,
        remaining: 50,
        period: "monthly",
        resetsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }
}
