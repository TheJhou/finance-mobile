jest.mock("expo-sqlite", () => require("@/__mocks__/expo-sqlite"));

import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import {
  authFetch,
  getAccessToken,
  getStoredTokens,
  getStoredUserName,
  isAuthenticated,
  login,
  logout,
  register,
} from "@/lib/auth";
import { getDb } from "@/lib/db";

// Helper to create a valid JWT with a future exp
function createMockToken(expInSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds }));
  return `${header}.${payload}.signature`;
}

function createExpiredToken(): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 }));
  return `${header}.${payload}.signature`;
}

describe("auth", () => {
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    resetMockDatabase();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe("decodePayload / isTokenExpired", () => {
    it("returns valid token when not expired", async () => {
      const token = createMockToken(3600);
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", token]
      );

      const result = await getAccessToken();
      expect(result).toBe(token);
    });

    it("triggers refresh when token is expired", async () => {
      const expired = createExpiredToken();
      const fresh = createMockToken(3600);

      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", expired]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", createMockToken(3600)]
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: fresh }),
      });

      const result = await getAccessToken();
      expect(result).toBe(fresh);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns null when both tokens are expired/missing", async () => {
      const expired = createExpiredToken();
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", expired]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", expired]
      );

      const result = await getAccessToken();
      expect(result).toBeNull();
    });
  });

  describe("getStoredTokens", () => {
    it("returns null when tokens are missing", async () => {
      const result = await getStoredTokens();
      expect(result).toBeNull();
    });

    it("returns tokens when both exist", async () => {
      const access = createMockToken(3600);
      const refresh = createMockToken(7200);
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", access]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", refresh]
      );

      const result = await getStoredTokens();
      expect(result).toEqual({ accessToken: access, refreshToken: refresh });
    });
  });

  describe("isAuthenticated", () => {
    it("returns false when no token", async () => {
      expect(await isAuthenticated()).toBe(false);
    });

    it("returns true with valid token", async () => {
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", createMockToken(3600)]
      );
      expect(await isAuthenticated()).toBe(true);
    });
  });

  describe("register", () => {
    it("stores tokens and user data on success", async () => {
      const access = createMockToken(3600);
      const refresh = createMockToken(7200);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: access,
          refreshToken: refresh,
          user: { name: "João", email: "joao@test.com" },
        }),
      });

      await register("João", "joao@test.com", "123456");

      expect(await getStoredTokens()).toEqual({
        accessToken: access,
        refreshToken: refresh,
      });
      expect(await getStoredUserName()).toBe("João");
    });

    it("throws with backend error message", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Email já cadastrado" }),
      });

      await expect(register("João", "joao@test.com", "123456")).rejects.toThrow("Email já cadastrado");
    });

    it("throws generic error when body is not JSON", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        text: async () => "Internal Server Error",
      });

      await expect(register("João", "joao@test.com", "123456")).rejects.toThrow("Falha ao criar conta");
    });
  });

  describe("login", () => {
    it("stores tokens on success", async () => {
      const access = createMockToken(3600);
      const refresh = createMockToken(7200);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: access,
          refreshToken: refresh,
          user: { name: "João", email: "joao@test.com" },
        }),
      });

      await login("joao@test.com", "123456");

      expect(await getStoredTokens()).toEqual({
        accessToken: access,
        refreshToken: refresh,
      });
    });

    it("throws on invalid credentials", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Credenciais inválidas" }),
      });

      await expect(login("joao@test.com", "wrong")).rejects.toThrow("Credenciais inválidas");
    });
  });

  describe("logout", () => {
    it("removes all auth data", async () => {
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", createMockToken(3600)]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", createMockToken(7200)]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["user_name", "João"]
      );

      await logout();

      expect(await getStoredTokens()).toBeNull();
      expect(await getStoredUserName()).toBeNull();
    });
  });

  describe("authFetch", () => {
    it("adds Authorization header", async () => {
      const token = createMockToken(3600);
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", token]
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

      await authFetch("https://api.test.com/data", { method: "GET" });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[1].headers.get("Authorization")).toBe(`Bearer ${token}`);
    });

    it("retries with refreshed token on 401", async () => {
      const expired = createExpiredToken();
      const fresh = createMockToken(3600);
      const refresh = createMockToken(7200);

      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", expired]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", refresh]
      );

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ status: 401, ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ accessToken: fresh }),
        })
        .mockResolvedValueOnce({ status: 200, ok: true });

      await authFetch("https://api.test.com/data");

      expect(global.fetch).toHaveBeenCalledTimes(3);
      const finalCall = (global.fetch as jest.Mock).mock.calls[2];
      expect(finalCall[1].headers.get("Authorization")).toBe(`Bearer ${fresh}`);
    });

    it("throws when token is missing", async () => {
      await expect(authFetch("https://api.test.com/data")).rejects.toThrow("Sessão expirada");
    });

    it("throws when refresh fails on 401", async () => {
      const expired = createExpiredToken();
      const refresh = createExpiredToken();

      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", expired]
      );
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_refresh_token", refresh]
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 401,
        ok: false,
      });

      await expect(authFetch("https://api.test.com/data")).rejects.toThrow("Sessão expirada");
    });

    it("does not retry on non-401 errors", async () => {
      const token = createMockToken(3600);
      await (await getDb()).runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ["jwt_access_token", token]
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 500,
        ok: false,
      });

      const response = await authFetch("https://api.test.com/data");
      expect(response.status).toBe(500);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
