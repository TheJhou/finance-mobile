// Cálculos de escala dos gráficos do dashboard (react-native-gifted-charts).

/** Barras que cabem na largura disponível (um mês tem até 31). */
export function fitBars(count: number, width: number): { barWidth: number; spacing: number } {
  const slot = width / Math.max(count, 1);
  const barWidth = Math.max(2, Math.min(12, slot * 0.6));
  return { barWidth, spacing: Math.max(1, slot - barWidth) };
}

/** Mostra só alguns rótulos no eixo X para não sobrepor os dias. */
export function thinLabels<T extends { label?: string }>(items: T[], maxLabels: number): T[] {
  const step = Math.ceil(items.length / maxLabels);
  return items.map((item, index) => (index % step === 0 ? item : { ...item, label: "" }));
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

/**
 * Escala do gráfico de saldo mensal. Meses negativos eram desenhados abaixo
 * da área visível e cortados; aqui as seções abaixo do eixo usam o mesmo passo.
 */
export function buildTrendScale(values: number[], sections = 3) {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const stepValue = (Math.max(max, Math.abs(min)) * 1.1 || 1) / sections;
  const sectionsBelow = min < 0 ? Math.min(sections, Math.ceil(Math.abs(min) / stepValue)) : 0;
  return {
    maxValue: stepValue * sections,
    stepValue,
    noOfSections: sections,
    ...(sectionsBelow > 0
      ? { noOfSectionsBelowXAxis: sectionsBelow, mostNegativeValue: -stepValue * sectionsBelow }
      : {}),
    formatYLabel: (label: string) => formatCompact(Number(label)),
  };
}
