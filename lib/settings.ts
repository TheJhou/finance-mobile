import { getDb } from "@/lib/db";

const CACHE_KEY = "month_start_day";
let cachedStartDay = 1;

export async function loadMonthStartDay(): Promise<number> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [CACHE_KEY]
    );
    if (row) {
      const day = parseInt(row.value, 10);
      if (day >= 1 && day <= 28) {
        cachedStartDay = day;
        return day;
      }
    }
  } catch {
    // DB not ready yet
  }
  return cachedStartDay;
}

export async function setMonthStartDay(day: number): Promise<void> {
  const clamped = Math.max(1, Math.min(28, day));
  cachedStartDay = clamped;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [CACHE_KEY, String(clamped)]
  );
}

export function getCachedMonthStartDay(): number {
  return cachedStartDay;
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function getBoolSetting(key: string, defaultValue = true): Promise<boolean> {
  const val = await getSetting(key);
  if (val === null) return defaultValue;
  return val === "true";
}
