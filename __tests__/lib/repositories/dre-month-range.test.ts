import {
  buildMonthRange,
  formatMonthRangeLabel,
  monthCount,
  monthRangePreset,
  shiftMonthRange,
  toMonthRange,
} from "@/lib/repositories/dre";

const sep2026 = { year: 2026, month: 8 };
const jul2026 = { year: 2026, month: 6 };

describe("intervalo de meses do Relatório", () => {
  it("um mês só: datas do mês inteiro e rótulo curto", () => {
    expect(buildMonthRange({ start: sep2026, end: sep2026 })).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      label: "Set 2026",
    });
  });

  it("vários meses no mesmo ano", () => {
    expect(buildMonthRange({ start: jul2026, end: sep2026 })).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      label: "Jul – Set 2026",
    });
  });

  it("intervalo atravessando o ano mostra os dois anos", () => {
    const range = { start: { year: 2025, month: 10 }, end: { year: 2026, month: 1 } };
    expect(formatMonthRangeLabel(range)).toBe("Nov 2025 – Fev 2026");
    expect(buildMonthRange(range).to).toBe("2026-02-28");
  });

  it("respeita o dia de início do mês financeiro", () => {
    expect(buildMonthRange({ start: jul2026, end: sep2026 }, 5)).toMatchObject({
      from: "2026-07-05",
      to: "2026-10-04",
    });
  });

  it("aceita os meses escolhidos em qualquer ordem", () => {
    expect(toMonthRange(sep2026, jul2026)).toEqual({ start: jul2026, end: sep2026 });
    expect(monthCount(toMonthRange(sep2026, jul2026))).toBe(3);
  });

  it("as setas andam o intervalo inteiro pelo próprio tamanho", () => {
    const quarter = { start: jul2026, end: sep2026 };
    expect(shiftMonthRange(quarter, 1)).toEqual({ start: { year: 2026, month: 9 }, end: { year: 2026, month: 11 } });
    expect(shiftMonthRange(quarter, -1)).toEqual({ start: { year: 2026, month: 3 }, end: { year: 2026, month: 5 } });
  });

  it("com um mês só, as setas andam de mês em mês atravessando o ano", () => {
    const dec = { year: 2026, month: 11 };
    expect(shiftMonthRange({ start: dec, end: dec }, 1)).toEqual({
      start: { year: 2027, month: 0 },
      end: { year: 2027, month: 0 },
    });
  });

  it("atalhos partem do mês financeiro atual", () => {
    expect(monthCount(monthRangePreset("current", sep2026))).toBe(1);
    expect(monthRangePreset("last3", sep2026)).toEqual({ start: jul2026, end: sep2026 });
    expect(monthCount(monthRangePreset("last6", sep2026))).toBe(6);
    expect(monthRangePreset("yearToDate", sep2026)).toEqual({ start: { year: 2026, month: 0 }, end: sep2026 });
  });

  it("'Últimos 3' em fevereiro volta para o ano anterior", () => {
    expect(monthRangePreset("last3", { year: 2026, month: 1 }).start).toEqual({ year: 2025, month: 11 });
  });
});

describe("getDreData com intervalo de meses", () => {
  async function seedPaid(date: string, amount: number, type: "INCOME" | "EXPENSE") {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    await db.runAsync("INSERT OR IGNORE INTO categories (id, name) VALUES ('cat-1', 'Geral')");
    await db.runAsync(
      "INSERT INTO transactions (id, description, amount, type, status, date, category_id) VALUES (?, 'T', ?, ?, 'PAID', ?, 'cat-1')",
      [Math.random().toString(36).slice(2), amount, type, date]
    );
  }

  it("soma o intervalo inteiro e agrupa a evolução por mês financeiro", async () => {
    const { getDreData } = await import("@/lib/repositories/dre");
    // Início do mês no dia 5: 03/08 ainda é julho; 04/10 ainda é setembro
    await seedPaid("2026-07-10", 1000, "INCOME");
    await seedPaid("2026-08-03", 200, "EXPENSE");
    await seedPaid("2026-09-20", 300, "EXPENSE");
    await seedPaid("2026-10-04", 50, "EXPENSE");
    await seedPaid("2026-10-05", 999, "EXPENSE"); // já é outubro: fora do intervalo

    const data = await getDreData(buildMonthRange({ start: jul2026, end: sep2026 }, 5));

    expect(data.totalIncome).toBe(1000);
    expect(data.totalExpense).toBe(550);
    expect(data.monthlyEvolution.map((m) => [m.month, m.income, m.expense])).toEqual([
      ["2026-07", 1000, 200],
      ["2026-09", 0, 350],
    ]);
  });
});
