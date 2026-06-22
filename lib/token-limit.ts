import { ApiError } from "./backend";

// Global state to track token limit exceeded
let isTokenLimitExceeded = false;
let limitExceededMessage = "";

export function getTokenLimitStatus(): { exceeded: boolean; message: string } {
  return { exceeded: isTokenLimitExceeded, message: limitExceededMessage };
}

export function setTokenLimitExceeded(message: string): void {
  isTokenLimitExceeded = true;
  limitExceededMessage = message;
  console.warn("[TokenLimit] Limite de tokens atingido:", message);
}

export function resetTokenLimitStatus(): void {
  isTokenLimitExceeded = false;
  limitExceededMessage = "";
  console.log("[TokenLimit] Status de limite resetado");
}

export function handleTokenLimitError(error: unknown): boolean {
  if (error instanceof ApiError && error.code === "TOKEN_LIMIT_EXCEEDED") {
    setTokenLimitExceeded(error.message);
    return true;
  }
  return false;
}

export function shouldSkipRequest(): boolean {
  return isTokenLimitExceeded;
}
