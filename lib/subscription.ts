import { authFetch } from "@/lib/auth";
import type { SubscriptionStatus } from "@/lib/types";

const BACKEND_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await authFetch(`${BACKEND_URL}/subscription/status`);

  if (!response.ok) {
    throw new Error("Erro ao consultar plano");
  }

  return response.json();
}
