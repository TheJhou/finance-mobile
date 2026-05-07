export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(safe);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.includes("T") ? value : value + "T00:00:00") : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

export function toDateInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseCurrencyInput(input: string): number {
  const normalized = input.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}
