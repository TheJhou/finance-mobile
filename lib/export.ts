import type { DreData } from "@/lib/repositories/dre";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtNum(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function sanitizeFileName(label: string): string {
  return label.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export async function exportDreCSV(data: DreData): Promise<void> {
  const label = sanitizeFileName(data.period.label);

  // Sheet 1 — DRE summary
  const summaryRows: object[] = [];

  summaryRows.push({ Secao: "RECEITAS", Categoria: "", Valor: "" });
  for (const row of data.incomeByCategory) {
    summaryRows.push({ Secao: "", Categoria: row.categoryName, Valor: fmtNum(row.total) });
  }
  summaryRows.push({ Secao: "TOTAL RECEITAS", Categoria: "", Valor: fmtNum(data.totalIncome) });
  summaryRows.push({ Secao: "", Categoria: "", Valor: "" });
  summaryRows.push({ Secao: "DESPESAS", Categoria: "", Valor: "" });
  for (const row of data.expenseByCategory) {
    summaryRows.push({ Secao: "", Categoria: row.categoryName, Valor: fmtNum(row.total) });
  }
  summaryRows.push({ Secao: "TOTAL DESPESAS", Categoria: "", Valor: fmtNum(data.totalExpense) });
  summaryRows.push({ Secao: "", Categoria: "", Valor: "" });
  summaryRows.push({ Secao: "RESULTADO LÍQUIDO", Categoria: "", Valor: fmtNum(data.netResult) });

  // Sheet 2 — Transactions
  const txRows = data.transactions.map((t) => ({
    Data: t.date,
    Descricao: t.description,
    Categoria: t.categoryName,
    Tipo: t.type === "INCOME" ? "Receita" : "Despesa",
    Valor: fmtNum(t.amount),
    Pagamento: t.paymentMethod,
    Status: t.status,
  }));

  const summaryCSV = Papa.unparse(summaryRows, { delimiter: ";" });
  const txCSV = Papa.unparse(txRows, { delimiter: ";" });

  const combined = `DRE - ${data.period.label}\n\n${summaryCSV}\n\n--- TRANSAÇÕES ---\n\n${txCSV}`;
  const file = new File(Paths.cache, `DRE_${label}.csv`);
  file.write(combined);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: `Exportar DRE — ${data.period.label}` });
  }
}

// ─── Excel (XLSX) ─────────────────────────────────────────────────────────────

export async function exportDreXLSX(data: DreData): Promise<void> {
  const label = sanitizeFileName(data.period.label);
  const wb = XLSX.utils.book_new();

  // --- DRE sheet ---
  const dreAoA: (string | number)[][] = [
    [`DRE — ${data.period.label}`],
    [],
    ["RECEITAS"],
    ["Categoria", "Valor (R$)"],
  ];
  for (const row of data.incomeByCategory) {
    dreAoA.push([row.categoryName, row.total]);
  }
  dreAoA.push(["TOTAL RECEITAS", data.totalIncome]);
  dreAoA.push([]);
  dreAoA.push(["DESPESAS"]);
  dreAoA.push(["Categoria", "Valor (R$)"]);
  for (const row of data.expenseByCategory) {
    dreAoA.push([row.categoryName, row.total]);
  }
  dreAoA.push(["TOTAL DESPESAS", data.totalExpense]);
  dreAoA.push([]);
  dreAoA.push(["RESULTADO LÍQUIDO", data.netResult]);

  const wsDre = XLSX.utils.aoa_to_sheet(dreAoA);
  wsDre["!cols"] = [{ wch: 30 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDre, "DRE");

  // --- Monthly evolution sheet ---
  if (data.monthlyEvolution.length > 0) {
    const evoAoA: (string | number)[][] = [
      ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"],
      ...data.monthlyEvolution.map((r) => [r.month, r.income, r.expense, r.result]),
    ];
    const wsEvo = XLSX.utils.aoa_to_sheet(evoAoA);
    wsEvo["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsEvo, "Evolução Mensal");
  }

  // --- Transactions sheet ---
  const txAoA: (string | number)[][] = [
    ["Data", "Descrição", "Categoria", "Tipo", "Valor (R$)", "Pagamento", "Status"],
    ...data.transactions.map((t) => [
      t.date,
      t.description,
      t.categoryName,
      t.type === "INCOME" ? "Receita" : "Despesa",
      t.amount,
      t.paymentMethod,
      t.status,
    ]),
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txAoA);
  wsTx["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsTx, "Transações");

  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const file = new File(Paths.cache, `DRE_${label}.xlsx`);
  file.write(wbout, { encoding: "base64" });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: `Exportar DRE — ${data.period.label}`,
    });
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function buildPdfHtml(data: DreData): string {
  const isPositive = data.netResult >= 0;
  const resultColor = isPositive ? "#16a34a" : "#dc2626";

  const incomeCategoryRows = data.incomeByCategory
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;">${r.categoryName}</td>
              <td style="padding:6px 12px;text-align:right;">${fmt(r.total)}</td></tr>`
    )
    .join("");

  const expenseCategoryRows = data.expenseByCategory
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;">${r.categoryName}</td>
              <td style="padding:6px 12px;text-align:right;">${fmt(r.total)}</td></tr>`
    )
    .join("");

  const monthlyRows = data.monthlyEvolution
    .map(
      (r) =>
        `<tr>
          <td style="padding:5px 10px;">${r.month}</td>
          <td style="padding:5px 10px;text-align:right;color:#16a34a;">${fmt(r.income)}</td>
          <td style="padding:5px 10px;text-align:right;color:#dc2626;">${fmt(r.expense)}</td>
          <td style="padding:5px 10px;text-align:right;color:${r.result >= 0 ? "#16a34a" : "#dc2626"};">${fmt(r.result)}</td>
        </tr>`
    )
    .join("");

  const txRows = data.transactions
    .slice(0, 200)
    .map(
      (t) =>
        `<tr>
          <td style="padding:4px 8px;font-size:11px;">${t.date}</td>
          <td style="padding:4px 8px;font-size:11px;">${t.description}</td>
          <td style="padding:4px 8px;font-size:11px;">${t.categoryName}</td>
          <td style="padding:4px 8px;font-size:11px;color:${t.type === "INCOME" ? "#16a34a" : "#dc2626"};">
            ${t.type === "INCOME" ? "+" : "-"}${fmt(t.amount)}
          </td>
        </tr>`
    )
    .join("");

  const txNote = data.transactions.length > 200
    ? `<p style="font-size:11px;color:#666;">(Exibindo 200 de ${data.transactions.length} transações)</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 24px; }
    h1 { font-size: 22px; color: #6366f1; margin-bottom: 4px; }
    h2 { font-size: 15px; color: #6366f1; margin: 20px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #f3f4f6; padding: 7px 12px; text-align: left; font-size: 12px; color: #374151; }
    tr:nth-child(even) td { background: #f9fafb; }
    .total-row td { font-weight: bold; border-top: 2px solid #e5e7eb; }
    .result-box { background: ${isPositive ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${isPositive ? "#bbf7d0" : "#fecaca"};
      border-radius: 8px; padding: 16px 20px; margin: 16px 0; display: flex; justify-content: space-between; }
    .result-label { font-size: 14px; font-weight: 600; }
    .result-value { font-size: 20px; font-weight: 700; color: ${resultColor}; }
  </style>
</head>
<body>
  <h1>Demonstração do Resultado</h1>
  <p class="subtitle">Período: ${data.period.label}</p>

  <h2>Receitas</h2>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${incomeCategoryRows}</tbody>
    <tfoot><tr class="total-row"><td style="padding:6px 12px;">Total Receitas</td>
      <td style="padding:6px 12px;text-align:right;color:#16a34a;">${fmt(data.totalIncome)}</td></tr></tfoot>
  </table>

  <h2>Despesas</h2>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${expenseCategoryRows}</tbody>
    <tfoot><tr class="total-row"><td style="padding:6px 12px;">Total Despesas</td>
      <td style="padding:6px 12px;text-align:right;color:#dc2626;">${fmt(data.totalExpense)}</td></tr></tfoot>
  </table>

  <div class="result-box">
    <span class="result-label">Resultado Líquido</span>
    <span class="result-value">${fmt(data.netResult)}</span>
  </div>

  ${
    monthlyRows
      ? `<h2>Evolução Mensal</h2>
         <table>
           <thead><tr><th>Mês</th><th style="text-align:right;">Receitas</th><th style="text-align:right;">Despesas</th><th style="text-align:right;">Resultado</th></tr></thead>
           <tbody>${monthlyRows}</tbody>
         </table>`
      : ""
  }

  <h2>Transações do Período</h2>
  ${txNote}
  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>
</body>
</html>`;
}

export async function exportDrePDF(data: DreData): Promise<void> {
  const label = sanitizeFileName(data.period.label);
  const html = buildPdfHtml(data);
  const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false });

  const dest = new File(Paths.cache, `DRE_${label}.pdf`);
  new File(pdfUri).move(dest);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest.uri, { mimeType: "application/pdf", dialogTitle: `Exportar DRE — ${data.period.label}` });
  }
}
