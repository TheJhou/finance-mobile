export const BACKEND_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!BACKEND_URL) {
  throw new Error("Backend URL not configured. Please set EXPO_PUBLIC_API_BASE_URL environment variable.");
}

// Validate URL format
try {
  new URL(BACKEND_URL);
} catch {
  throw new Error("Invalid backend URL format. Please provide a valid HTTP/HTTPS URL.");
}
