/**
 * Restauração de backup contra o schema real (foreign keys ativas).
 */
import { BackupSystem } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { createRecurring } from "@/lib/repositories/recurring";
import { createTransaction } from "@/lib/repositories/transactions";

async function count(table: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
  return row?.c ?? 0;
}

describe("BackupSystem.restoreBackup", () => {
  it("restaura transações geradas por recorrências (FK recurring_id)", async () => {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO categories (id, name) VALUES ('cat-1', 'Moradia')");
    await createRecurring({
      description: "Aluguel",
      amount: 1200,
      type: "EXPENSE",
      frequency: "MONTHLY",
      startDate: "2026-01-05",
      nextDueDate: "2026-01-05",
      endDate: "2026-03-05",
      categoryId: "cat-1",
    });
    await createTransaction({ description: "Mercado", amount: 80, type: "EXPENSE", date: "2026-01-10", categoryId: "cat-1" });
    const transactionsBefore = await count("transactions");

    const backup = await BackupSystem.createBackup();
    expect(backup.success).toBe(true);

    // Simula perda de dados antes de restaurar
    await db.execAsync("DELETE FROM transactions; DELETE FROM recurring_transactions;");

    const result = await BackupSystem.restoreBackup(backup.filePath!);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(await count("recurring_transactions")).toBe(1);
    expect(await count("transactions")).toBe(transactionsBefore);
  });
});
