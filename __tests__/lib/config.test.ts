import { BACKEND_URL } from "@/lib/config";

describe("config", () => {
  it("exports BACKEND_URL", () => {
    expect(BACKEND_URL).toBeDefined();
    expect(typeof BACKEND_URL).toBe("string");
    expect(BACKEND_URL.length).toBeGreaterThan(0);
  });

  it("uses localhost fallback when env var is not set", () => {
    // Since process.env.EXPO_PUBLIC_API_BASE_URL is not set in test env,
    // it should fallback to localhost:3000
    expect(BACKEND_URL).toBe("http://localhost:3000");
  });
});
