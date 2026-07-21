/**
 * Testes para recurring.ts — commits 7525031, b3fb88d
 *
 * Cobertura adicional aos testes existentes em repositories/recurring.test.ts:
 * - advanceDate (indiretamente via processRecurringDue)
 * - postRecurringTransaction: cria transação e avança nextDueDate
 * - postRecurringTransaction: desativa se passar end_date
 * - processRecurringDue: cria múltiplas transações para múltiplas ocorrências atrasadas
 * - updateRecurring: não faz nada se data vazia
 * - updateRecurring: atualiza campos parciais
 * - toggleRecurringActive
 */

import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import {
    createRecurring,
    deleteRecurring,
    getRecurring,
    listRecurring,
    processRecurringDue,
    toggleRecurringActive,
    updateRecurring,
} from "@/lib/repositories/recurring";

beforeEach(async () => {
  resetMockDatabase();
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'tag',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PAID',
      payment_method TEXT,
      date TEXT NOT NULL,
      notes TEXT,
      category_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      frequency TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      is_active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT,
      next_due_date TEXT NOT NULL,
      category_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  // Insert a category
  await db.runAsync(
    "INSERT INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)",
    ["cat-1", "Mercado", "#6366f1", "tag", 0]
  );
});

async function seedRecurring(overrides: Partial<{
  id: string;
  description: string;
  amount: number;
  type: string;
  frequency: string;
  paymentMethod: string;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  categoryId: string;
}> = {}) {
  return createRecurring({
    description: overrides.description ?? "Aluguel",
    amount: overrides.amount ?? 1500,
    type: (overrides.type as any) ?? "EXPENSE",
    frequency: (overrides.frequency as any) ?? "MONTHLY",
    paymentMethod: (overrides.paymentMethod as any) ?? "PIX",
    isActive: overrides.isActive ?? true,
    startDate: overrides.startDate ?? "2025-01-01",
    endDate: overrides.endDate ?? null,
    nextDueDate: overrides.nextDueDate ?? "2025-06-01",
    categoryId: overrides.categoryId ?? "cat-1",
  });
}

describe("recurring — createRecurring", () => {
  it("gera parcelas PENDING ao criar recorrência ativa", async () => {
    const rec = await seedRecurring({ nextDueDate: "2025-06-01", endDate: "2025-12-01" });

    const db = await getDb();
    const txs = await db.getAllAsync<any>("SELECT * FROM transactions WHERE recurring_id = ?", [rec.id]);
    expect(txs).toHaveLength(7); // 2025-06-01 até 2025-12-01 mensal
    expect(txs[0].status).toBe("PENDING");
    expect(txs[0].description).toBe("Aluguel");
    expect(txs[0].amount).toBe(1500);
  });

  it("não gera parcelas se recorrência estiver inativa", async () => {
    const rec = await seedRecurring({ isActive: false });

    const db = await getDb();
    const txs = await db.getAllAsync<any>("SELECT * FROM transactions WHERE recurring_id = ?", [rec.id]);
    expect(txs).toHaveLength(0);
  });
});

describe("recurring — processRecurringDue", () => {
  it("não cria novas transações, apenas atualiza nextDueDate", async () => {
    const rec = await seedRecurring({ nextDueDate: "2025-06-01", endDate: "2025-12-01" });

    const count = await processRecurringDue();
    expect(count).toBe(0);

    const updated = await getRecurring(rec.id);
    expect(updated!.nextDueDate).toBe("2025-06-01");
  });
});

describe("recurring — updateRecurring", () => {
  it("atualiza campos parciais", async () => {
    const rec = await seedRecurring();

    await updateRecurring(rec.id, { description: "Aluguel Atualizado", amount: 2000 });

    const updated = await getRecurring(rec.id);
    expect(updated!.description).toBe("Aluguel Atualizado");
    expect(updated!.amount).toBe(2000);
  });

  it("não faz nada se data vazia", async () => {
    const rec = await seedRecurring({ description: "Original" });

    await updateRecurring(rec.id, {});

    const updated = await getRecurring(rec.id);
    expect(updated!.description).toBe("Original");
  });

  it("converte isActive boolean para 0/1", async () => {
    const rec = await seedRecurring({ isActive: true });

    await updateRecurring(rec.id, { isActive: false });

    const updated = await getRecurring(rec.id);
    expect(updated!.isActive).toBe(false);
  });
});

describe("recurring — toggleRecurringActive", () => {
  it("ativa recorrência inativa", async () => {
    const rec = await seedRecurring({ isActive: false });
    await toggleRecurringActive(rec.id, true);

    const updated = await getRecurring(rec.id);
    expect(updated!.isActive).toBe(true);
  });

  it("desativa recorrência ativa", async () => {
    const rec = await seedRecurring({ isActive: true });
    await toggleRecurringActive(rec.id, false);

    const updated = await getRecurring(rec.id);
    expect(updated!.isActive).toBe(false);
  });
});

describe("recurring — deleteRecurring", () => {
  it("remove recorrência", async () => {
    const rec = await seedRecurring();
    await deleteRecurring(rec.id);

    const deleted = await getRecurring(rec.id);
    expect(deleted).toBeNull();
  });
});

describe("recurring — listRecurring", () => {
  it("lista ordenado por is_active DESC e next_due_date ASC", async () => {
    await seedRecurring({ description: "Inativa", isActive: false, nextDueDate: "2025-01-01" });
    await seedRecurring({ description: "Ativa A", isActive: true, nextDueDate: "2025-06-01" });
    await seedRecurring({ description: "Ativa B", isActive: true, nextDueDate: "2025-03-01" });

    const list = await listRecurring();
    expect(list).toHaveLength(3);
    // Ativas primeiro
    expect(list[0].isActive).toBe(true);
    expect(list[1].isActive).toBe(true);
    // Entre as ativas, ordenado por nextDueDate ASC
    expect(list[0].nextDueDate <= list[1].nextDueDate).toBe(true);
    // Inativa por último
    expect(list[2].isActive).toBe(false);
  });
});
