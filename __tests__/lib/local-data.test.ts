import { login } from "@/lib/auth";
import { BackupSystem } from "@/lib/backup";
import { getDb } from "@/lib/db";
import {
  adoptLocalDataOwnerIfMissing,
  backupThenSignOut,
  claimLocalDataFor,
  clearLocalUserData,
} from "@/lib/local-data";
import { createRecurring } from "@/lib/repositories/recurring";
import { createTransaction } from "@/lib/repositories/transactions";
import { getCachedMonthStartDay, loadMonthStartDay, setMonthStartDay } from "@/lib/settings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

async function seedUserData() {
  const db = await getDb();
  const category = await db.getFirstAsync<{ id: string }>("SELECT id FROM categories LIMIT 1");
  const categoryId = category!.id;
  await createTransaction({ description: "Mercado", amount: 50, type: "EXPENSE", date: "2026-09-01", categoryId });
  await createRecurring({
    description: "Aluguel",
    amount: 1200,
    type: "EXPENSE",
    frequency: "MONTHLY",
    startDate: "2026-09-05",
    nextDueDate: "2026-09-05",
    categoryId,
  });
  await db.runAsync("INSERT OR REPLACE INTO categories (id, name) VALUES ('custom', 'Pets')");
  await setMonthStartDay(10);
}

async function countRows(table: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
  return row?.c ?? 0;
}

function createToken(expInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds }));
  return `header.${payload}.signature`;
}

const ACCESS_TOKEN = createToken(3600);
const REFRESH_TOKEN = createToken(7200);

function mockLoginResponse(email: string) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, user: { name: "X", email } }),
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn();
  jest.clearAllMocks();
});

describe("clearLocalUserData", () => {
  it("apaga transações, recorrências e categorias personalizadas, recriando as padrão", async () => {
    await seedUserData();
    expect(await countRows("transactions")).toBeGreaterThan(0);

    await clearLocalUserData();

    expect(await countRows("transactions")).toBe(0);
    expect(await countRows("recurring_transactions")).toBe(0);
    expect(await countRows("settings")).toBe(0);
    const db = await getDb();
    const custom = await db.getFirstAsync("SELECT id FROM categories WHERE name = 'Pets'");
    expect(custom).toBeNull();
    expect(await countRows("categories")).toBe(10);
  });

  it("volta o início do mês para o dia 1", async () => {
    await seedUserData();
    expect(getCachedMonthStartDay()).toBe(10);

    await clearLocalUserData();

    expect(getCachedMonthStartDay()).toBe(1);
    expect(await loadMonthStartDay()).toBe(1);
  });

  it("remove chaves do usuário no AsyncStorage mas mantém o tema do aparelho", async () => {
    await AsyncStorage.setItem("biometric_auth_enabled", "true");
    await AsyncStorage.setItem("ai_forecast_cache", "{}");
    await AsyncStorage.setItem("app_theme_mode", "light");

    await clearLocalUserData();

    expect(await AsyncStorage.getItem("biometric_auth_enabled")).toBeNull();
    expect(await AsyncStorage.getItem("ai_forecast_cache")).toBeNull();
    expect(await AsyncStorage.getItem("app_theme_mode")).toBe("light");
  });

  it("apaga backups locais e cancela lembretes agendados", async () => {
    await seedUserData();
    const backup = await BackupSystem.createBackup();
    expect(backup.success).toBe(true);
    expect(await BackupSystem.listBackups()).toHaveLength(1);

    await clearLocalUserData();

    expect(await BackupSystem.listBackups()).toHaveLength(0);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});

describe("claimLocalDataFor", () => {
  it("mantém os dados quando é a mesma conta (e-mail sem diferenciar maiúsculas)", async () => {
    await claimLocalDataFor("ana@test.com");
    await seedUserData();

    await claimLocalDataFor("  ANA@test.com ");

    expect(await countRows("transactions")).toBeGreaterThan(0);
  });

  it("apaga os dados quando outra conta entra no aparelho", async () => {
    await claimLocalDataFor("ana@test.com");
    await seedUserData();

    await claimLocalDataFor("bruno@test.com");

    expect(await countRows("transactions")).toBe(0);
    expect(await SecureStore.getItemAsync("local_data_owner")).toBe("bruno@test.com");
  });

  it("não apaga nada no primeiro login do aparelho", async () => {
    await seedUserData();

    await claimLocalDataFor("ana@test.com");

    expect(await countRows("transactions")).toBeGreaterThan(0);
  });
});

describe("login", () => {
  it("impede que um segundo usuário veja os dados do anterior", async () => {
    mockLoginResponse("ana@test.com");
    await login("ana@test.com", "senha1234");
    await seedUserData();

    mockLoginResponse("bruno@test.com");
    await login("bruno@test.com", "senha1234");

    expect(await countRows("transactions")).toBe(0);
  });
});

describe("adoptLocalDataOwnerIfMissing", () => {
  it("adota o usuário logado em instalações antigas sem dono registrado", async () => {
    await adoptLocalDataOwnerIfMissing("Ana@Test.com");
    expect(await SecureStore.getItemAsync("local_data_owner")).toBe("ana@test.com");
  });

  it("não sobrescreve um dono já registrado", async () => {
    await claimLocalDataFor("ana@test.com");
    await adoptLocalDataOwnerIfMissing("bruno@test.com");
    expect(await SecureStore.getItemAsync("local_data_owner")).toBe("ana@test.com");
  });
});

describe("backupThenSignOut", () => {
  it("não apaga nada nem desloga se o backup na nuvem falhar", async () => {
    mockLoginResponse("ana@test.com");
    await login("ana@test.com", "senha1234");
    await seedUserData();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));

    await expect(backupThenSignOut()).rejects.toThrow(/continua conectado/);

    expect(await countRows("transactions")).toBeGreaterThan(0);
    expect(await SecureStore.getItemAsync("jwt_refresh_token")).toBe(REFRESH_TOKEN);
  });
});
