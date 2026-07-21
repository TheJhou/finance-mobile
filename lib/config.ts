export const BACKEND_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

// Validate URL format
try {
  new URL(BACKEND_URL);
} catch {
  throw new Error("Invalid backend URL format. Please provide a valid HTTP/HTTPS URL.");
}
