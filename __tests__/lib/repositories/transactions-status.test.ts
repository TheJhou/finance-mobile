import { getDb } from "@/lib/db";
import {
  createTransaction,
  getTransaction,
  markOverdueTransactions,
  updateTransaction,
} from "@/lib/repositories/transactions";
import { formatDateLocal } from "@/lib/utils";

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

beforeEach(async () => {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO categories (id, name) VALUES ('cat-1', 'Moradia')");
});

async function createOverdueBill(): Promise<string> {
  const tx = await createTransaction({
    description: "Luz",
    amount: 200,
    type: "EXPENSE",
    status: "PENDING",
    date: daysFromToday(-5),
    categoryId: "cat-1",
  });
  await markOverdueTransactions();
  expect((await getTransaction(tx.id))!.status).toBe("OVERDUE");
  return tx.id;
}

describe("status de conta vencida ao editar a data", () => {
  it("volta para PENDING quando o vencimento é adiado para o futuro", async () => {
    const id = await createOverdueBill();

    await updateTransaction(id, { date: daysFromToday(10) });

    expect((await getTransaction(id))!.status).toBe("PENDING");
  });

  it("continua OVERDUE se a nova data ainda é passada", async () => {
    const id = await createOverdueBill();

    await updateTransaction(id, { date: daysFromToday(-1) });

    expect((await getTransaction(id))!.status).toBe("OVERDUE");
  });

  it("respeita um status informado explicitamente", async () => {
    const id = await createOverdueBill();

    await updateTransaction(id, { date: daysFromToday(10), status: "PAID" });

    expect((await getTransaction(id))!.status).toBe("PAID");
  });

  it("não altera transações pagas ao mudar a data", async () => {
    const tx = await createTransaction({
      description: "Mercado",
      amount: 50,
      type: "EXPENSE",
      date: daysFromToday(-5),
      categoryId: "cat-1",
    });

    await updateTransaction(tx.id, { date: daysFromToday(10) });

    expect((await getTransaction(tx.id))!.status).toBe("PAID");
  });
});
