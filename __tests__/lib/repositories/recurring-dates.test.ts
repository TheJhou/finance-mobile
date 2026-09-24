import { getDb } from "@/lib/db";
import { createRecurring, processRecurringDue, updateRecurring } from "@/lib/repositories/recurring";
import type { Frequency } from "@/lib/types";

async function generatedDates(startDate: string, frequency: Frequency, endDate: string): Promise<string[]> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO categories (id, name) VALUES ('cat-1', 'Moradia')");
  const rec = await createRecurring({
    description: "Conta",
    amount: 100,
    type: "EXPENSE",
    frequency,
    startDate,
    nextDueDate: startDate,
    endDate,
    categoryId: "cat-1",
  });
  const rows = await db.getAllAsync<{ date: string }>(
    "SELECT date FROM transactions WHERE recurring_id = ? ORDER BY date",
    [rec.id]
  );
  return rows.map((r) => r.date);
}

describe("datas geradas por recorrências", () => {
  it("mensal no dia 31 usa o último dia dos meses curtos e volta ao 31", async () => {
    expect(await generatedDates("2026-01-31", "MONTHLY", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("mensal no dia 30 não pula fevereiro nem desliza para o dia 2", async () => {
    expect(await generatedDates("2026-01-30", "MONTHLY", "2026-03-30")).toEqual([
      "2026-01-30",
      "2026-02-28",
      "2026-03-30",
    ]);
  });

  it("mensal em ano bissexto usa 29 de fevereiro", async () => {
    expect(await generatedDates("2028-01-31", "MONTHLY", "2028-03-31")).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
  });

  it("anual em 29/02 cai em 28/02 nos anos não bissextos e volta ao 29", async () => {
    expect(await generatedDates("2028-02-29", "YEARLY", "2032-02-29")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("editar a recorrência depois de pagar janeiro mantém o dia 31 como âncora", async () => {
    await generatedDates("2026-01-31", "MONTHLY", "2026-05-31");
    const db = await getDb();
    const rec = await db.getFirstAsync<{ id: string }>("SELECT id FROM recurring_transactions");
    await db.runAsync("UPDATE transactions SET status = 'PAID' WHERE date = '2026-01-31'");
    await processRecurringDue(); // next_due_date passa a ser 2026-02-28

    await updateRecurring(rec!.id, { amount: 150 });

    const pending = await db.getAllAsync<{ date: string; amount: number }>(
      "SELECT date, amount FROM transactions WHERE status = 'PENDING' ORDER BY date"
    );
    expect(pending.map((p) => p.date)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(pending.every((p) => p.amount === 150)).toBe(true);
  });

  it("mudar o vencimento para o dia 10 redefine a série (não herda o dia 31)", async () => {
    await generatedDates("2026-01-31", "MONTHLY", "2026-04-30");
    const db = await getDb();
    const rec = await db.getFirstAsync<{ id: string }>("SELECT id FROM recurring_transactions");

    await updateRecurring(rec!.id, { nextDueDate: "2026-02-10" });

    const pending = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM transactions WHERE status = 'PENDING' ORDER BY date"
    );
    expect(pending.map((p) => p.date)).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);
  });

  it("semanal avança 7 dias atravessando meses", async () => {
    expect(await generatedDates("2026-01-28", "WEEKLY", "2026-02-12")).toEqual([
      "2026-01-28",
      "2026-02-04",
      "2026-02-11",
    ]);
  });
});
