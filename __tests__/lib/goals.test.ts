jest.mock("@/lib/auth", () => ({ authFetch: jest.fn() }));
jest.mock("@/lib/token-limit", () => ({ handleTokenLimitError: jest.fn() }));

import { authFetch } from "@/lib/auth";
import { createGoal, deleteGoal, depositGoal, updateGoal, type GoalData } from "@/lib/backend";
import {
  describeGoalProgress,
  emptyGoalForm,
  goalToForm,
  parseGoalForm,
  sortGoals,
  summarizeGoals,
} from "@/lib/goals";

const mockAuthFetch = authFetch as jest.MockedFunction<typeof authFetch>;
const TODAY = new Date(2026, 8, 25, 10, 0, 0); // 25/09/2026

function goal(overrides: Partial<GoalData> = {}): GoalData {
  return {
    id: "g1",
    name: "Viagem",
    targetValue: 1000,
    savedValue: 400,
    progress: 40,
    remaining: 600,
    estimatedMonths: 3,
    deadline: null,
    icon: "airplane",
    color: "#60a5fa",
    ...overrides,
  };
}

describe("parseGoalForm", () => {
  it("monta o payload com valores em formato brasileiro e prazo", () => {
    const result = parseGoalForm(
      { ...emptyGoalForm(), name: "  Viagem  ", target: "1.500,50", saved: "200", deadline: "2026-12-20" },
      TODAY
    );
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Viagem",
        targetValue: 1500.5,
        savedValue: 200,
        deadline: "2026-12-20T12:00:00.000Z",
        icon: "trending-up",
        color: "#a78bfa",
      },
    });
  });

  it("sem prazo e sem valor guardado", () => {
    const result = parseGoalForm({ ...emptyGoalForm(), name: "Reserva", target: "5000" }, TODAY);
    expect(result).toMatchObject({ ok: true, data: { savedValue: 0, deadline: null } });
  });

  it("aponta cada campo inválido", () => {
    const result = parseGoalForm({ ...emptyGoalForm(), name: " ", target: "0", deadline: "2026-09-01" }, TODAY);
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Dê um nome para a meta",
        target: "Informe um valor maior que zero",
        deadline: "O prazo precisa ser hoje ou depois",
      },
    });
  });

  it("aceita prazo para hoje", () => {
    expect(parseGoalForm({ ...emptyGoalForm(), name: "X", target: "10", deadline: "2026-09-25" }, TODAY).ok).toBe(true);
  });

  it("volta ao formulário a partir da meta", () => {
    expect(goalToForm(goal({ deadline: "2026-12-20T12:00:00.000Z" }))).toMatchObject({
      target: "1000,00",
      saved: "400,00",
      deadline: "2026-12-20",
    });
  });
});

describe("describeGoalProgress", () => {
  it("concluída", () => {
    expect(describeGoalProgress(goal({ savedValue: 1000, remaining: 0 }), TODAY)).toBe("Meta concluída!");
  });

  it("com prazo: quanto guardar por mês", () => {
    const text = describeGoalProgress(goal({ deadline: "2026-12-24T12:00:00.000Z" }), TODAY);
    expect(text).toMatch(/^Prazo 24\/12\/2026 · guarde R\$\s?200,00\/mês$/);
  });

  it("prazo em menos de um mês", () => {
    const text = describeGoalProgress(goal({ deadline: "2026-10-10T12:00:00.000Z" }), TODAY);
    expect(text).toMatch(/guarde R\$\s?600,00 até lá/);
  });

  it("prazo encerrado", () => {
    expect(describeGoalProgress(goal({ deadline: "2026-09-01T12:00:00.000Z" }), TODAY)).toBe(
      "Prazo encerrado em 01/09/2026"
    );
  });

  it("sem prazo: estimativa pelo ritmo, ou convite ao primeiro depósito", () => {
    expect(describeGoalProgress(goal(), TODAY)).toBe("No ritmo atual, cerca de 3 meses");
    expect(describeGoalProgress(goal({ savedValue: 0, estimatedMonths: null }), TODAY)).toBe(
      "Faça o primeiro depósito para começar"
    );
  });
});

describe("sortGoals / summarizeGoals", () => {
  const done = goal({ id: "done", savedValue: 1000, remaining: 0 });
  const later = goal({ id: "later", deadline: "2027-06-01T12:00:00.000Z" });
  const sooner = goal({ id: "sooner", deadline: "2026-11-01T12:00:00.000Z" });
  const noDeadline = goal({ id: "none" });

  it("em andamento pelo prazo mais próximo; concluídas no fim", () => {
    expect(sortGoals([done, noDeadline, later, sooner]).map((g) => g.id)).toEqual(["sooner", "later", "none", "done"]);
  });

  it("totaliza guardado, alvo e concluídas", () => {
    expect(summarizeGoals([done, later])).toEqual({ count: 2, done: 1, saved: 1400, target: 2000, percent: 70 });
    expect(summarizeGoals([])).toMatchObject({ count: 0, percent: 0 });
  });
});

describe("API de metas", () => {
  const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body }) as Response;

  beforeEach(() => mockAuthFetch.mockReset());

  it("depósito envia a chave de idempotência", async () => {
    mockAuthFetch.mockResolvedValue(ok());
    await depositGoal("g1", 50, "key-12345678");
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/\/goals\/g1\/deposit$/);
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-12345678");
    expect(JSON.parse(init?.body as string)).toEqual({ amount: 50 });
  });

  it("criar meta envia a chave de idempotência", async () => {
    mockAuthFetch.mockResolvedValue(ok());
    await createGoal({ name: "X", targetValue: 10 }, "key-abcdefgh");
    expect((mockAuthFetch.mock.calls[0][1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-abcdefgh");
  });

  it("editar usa PATCH e excluir aceita 204 sem corpo", async () => {
    mockAuthFetch.mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error("sem corpo"); } } as unknown as Response);
    await updateGoal("g1", { name: "Nova" });
    await expect(deleteGoal("g1")).resolves.toBeUndefined();
    expect(mockAuthFetch.mock.calls[0][1]?.method).toBe("PATCH");
    expect(mockAuthFetch.mock.calls[1][1]?.method).toBe("DELETE");
  });
});
