import { BACKEND_URL } from "@/lib/config";
import { authFetch } from "@/lib/auth";
import type { SubscriptionStatus } from "@/lib/types";

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await authFetch(`${BACKEND_URL}/subscription/status`);

  if (!response.ok) {
    throw new Error("Erro ao consultar plano");
  }

  return response.json();
}
