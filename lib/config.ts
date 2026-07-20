export const BACKEND_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export const APP_SECRET: string = process.env.EXPO_PUBLIC_APP_SECRET ?? "";

// Validate URL format
try {
  new URL(BACKEND_URL);
} catch {
  throw new Error("Invalid backend URL format. Please provide a valid HTTP/HTTPS URL.");
}
