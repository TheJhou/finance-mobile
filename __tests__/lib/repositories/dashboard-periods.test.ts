/**
 * Períodos do dashboard: mês selecionado, dia de início personalizado
 * e o que conta como "conta vencida".
 */
import { getDb } from "@/lib/db";
import { getCurrentPeriod, getDashboard } from "@/lib/repositories/dashboard";

async function seed(tx: { amount: number; type: "INCOME" | "EXPENSE"; status: string; date: string }) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES ('cat-1', 'Geral', '#fff', 'tag')"
  );
  await db.runAsync(
    `INSERT INTO transactions (id, description, amount, type, status, date, category_id)
     VALUES (?, 'T', ?, ?, ?, ?, 'cat-1')`,
    [Math.random().toString(36).slice(2), tx.amount, tx.type, tx.status, tx.date]
  );
}

function setToday(isoDate: string) {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  jest.setSystemTime(new Date(`${isoDate}T12:00:00`));
}

afterEach(() => {
  jest.useRealTimers();
});

describe("contas vencidas", () => {
  it("não conta receitas atrasadas como contas vencidas", async () => {
    setToday("2026-09-24");
    await seed({ amount: 100, type: "EXPENSE", status: "PENDING", date: "2026-09-10" });
    await seed({ amount: 900, type: "INCOME", status: "PENDING", date: "2026-09-10" });

    const data = await getDashboard();

    expect(data.overdueAmount).toBe(100);
    expect(data.overdueCount).toBe(1);
  });

  it("receita pendente não entra nas contas a pagar da semana", async () => {
    setToday("2026-09-24");
    await seed({ amount: 200, type: "EXPENSE", status: "PENDING", date: "2026-09-26" });
    await seed({ amount: 5000, type: "INCOME", status: "PENDING", date: "2026-09-26" });

    const data = await getDashboard();

    expect(data.upcomingAmount).toBe(200);
  });
});

describe("janeiro selecionado", () => {
  it("em janeiro de outro ano, vencidas e próximas usam o mês selecionado, não hoje", async () => {
    setToday("2026-09-24");
    // Pendente em 15/01/2025: dentro de jan/2025, não é "vencida antes do mês"
    await seed({ amount: 300, type: "EXPENSE", status: "PENDING", date: "2025-01-15" });

    const jan = await getDashboard({ year: 2025, month: 0 });

    expect(jan.overdueAmount).toBe(0);
    expect(jan.upcomingAmount).toBe(300);
  });
});

describe("dia de início do mês personalizado", () => {
  it("antes do dia de início, o período atual ainda é o do mês anterior", () => {
    setToday("2026-09-03");
    expect(getCurrentPeriod(5)).toEqual({ year: 2026, month: 7 }); // agosto: 05/08 a 04/09
  });

  it("a partir do dia de início, o período atual é o do mês corrente", () => {
    setToday("2026-09-05");
    expect(getCurrentPeriod(5)).toEqual({ year: 2026, month: 8 });
  });

  it("virada de ano: 03/01 com início no dia 5 pertence a dezembro do ano anterior", () => {
    setToday("2026-01-03");
    expect(getCurrentPeriod(5)).toEqual({ year: 2025, month: 11 });
  });

  it("dashboard sem mês explícito soma o período em andamento", async () => {
    setToday("2026-09-03");
    await seed({ amount: 1000, type: "INCOME", status: "PAID", date: "2026-08-20" }); // período atual
    await seed({ amount: 50, type: "INCOME", status: "PAID", date: "2026-09-06" }); // próximo período

    const data = await getDashboard({ monthStartDay: 5 });

    expect(data.monthlyIncome).toBe(1000);
  });
});
