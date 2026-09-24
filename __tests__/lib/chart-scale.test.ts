import { buildTrendScale, fitBars, formatCompact, thinLabels } from "@/lib/chart-scale";

describe("buildTrendScale", () => {
  it("só valores positivos: nenhuma seção abaixo do eixo", () => {
    const scale = buildTrendScale([1000, 2500, 800]);

    expect(scale.maxValue).toBeGreaterThanOrEqual(2500);
    expect(scale).not.toHaveProperty("noOfSectionsBelowXAxis");
  });

  it("mês negativo: cria seções abaixo do eixo que cobrem o valor mínimo", () => {
    const scale = buildTrendScale([3000, -1200, 500]);

    expect(scale.noOfSectionsBelowXAxis).toBeGreaterThanOrEqual(1);
    expect(scale.mostNegativeValue).toBeLessThanOrEqual(-1200);
    // Mesmo passo acima e abaixo do eixo
    expect(scale.mostNegativeValue! / scale.noOfSectionsBelowXAxis!).toBeCloseTo(-scale.stepValue);
  });

  it("todos os meses negativos: o gráfico ainda tem escala válida", () => {
    const scale = buildTrendScale([-500, -2000]);

    expect(scale.maxValue).toBeGreaterThan(0);
    expect(scale.mostNegativeValue).toBeLessThanOrEqual(-2000);
    expect(scale.noOfSectionsBelowXAxis).toBeLessThanOrEqual(scale.noOfSections);
  });

  it("sem dados: não divide por zero", () => {
    const scale = buildTrendScale([0]);

    expect(Number.isFinite(scale.stepValue)).toBe(true);
    expect(scale.stepValue).toBeGreaterThan(0);
  });

  it("formata os rótulos do eixo Y de forma compacta", () => {
    expect(buildTrendScale([5000]).formatYLabel("5500")).toBe("5.5k");
  });
});

describe("fitBars", () => {
  it("31 barras cabem na coluna estreita do dashboard", () => {
    const width = 126;
    const { barWidth, spacing } = fitBars(31, width);

    expect((barWidth + spacing) * 31).toBeLessThanOrEqual(width + 0.001);
    expect(barWidth).toBeGreaterThanOrEqual(2);
  });

  it("com poucas barras, limita a largura de cada uma", () => {
    expect(fitBars(3, 300).barWidth).toBe(12);
  });

  it("não quebra sem dados", () => {
    expect(Number.isFinite(fitBars(0, 100).spacing)).toBe(true);
  });
});

describe("thinLabels", () => {
  it("mantém só alguns rótulos e preserva os valores", () => {
    const days = Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), value: i }));
    const thinned = thinLabels(days, 6);

    expect(thinned.filter((d) => d.label !== "").length).toBeLessThanOrEqual(6);
    expect(thinned.map((d) => d.value)).toEqual(days.map((d) => d.value));
  });
});

describe("formatCompact", () => {
  it.each([
    [950, "950"],
    [1500, "1.5k"],
    [12_000, "12k"],
    [-2_500, "-2.5k"],
    [3_200_000, "3.2M"],
  ])("%s → %s", (value, expected) => {
    expect(formatCompact(value)).toBe(expected);
  });
});
