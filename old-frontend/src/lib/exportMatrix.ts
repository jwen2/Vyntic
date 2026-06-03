/**
 * Export the deal comparison matrix as a CSV file.
 * Strips Markdown formatting for clean spreadsheet output.
 */
import { CellData, SYNTHESIS_DEAL_ID } from "@/lib/api";

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
    .replace(/\*(.*?)\*/g, "$1") // italic
    .replace(/\[Source\s+\d+\]/g, "") // citations
    .replace(/\|/g, " ") // table pipes
    .replace(/-{3,}/g, "") // horizontal rules
    .replace(/#{1,6}\s/g, "") // headings
    .replace(/\n{2,}/g, "\n") // extra newlines
    .trim();
}

function escapeCSV(value: string): string {
  // If value contains comma, newline, or double-quote, wrap in quotes
  const cleaned = stripMarkdown(value);
  if (cleaned.includes(",") || cleaned.includes("\n") || cleaned.includes('"')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}

export function exportMatrixCSV(
  deals: string[],
  queries: string[],
  cells: Record<string, Record<string, CellData>>
): void {
  if (deals.length === 0 || queries.length === 0) return;

  // Header row
  const header = ["Deal", ...queries.map((q) => escapeCSV(q))].join(",");

  // Data rows
  const rows = deals.map((dealId) => {
    const dealCells = queries.map((q) => {
      const cell = cells[dealId]?.[q];
      if (!cell || cell.status === "loading") return "";
      if (cell.status === "error") return escapeCSV(`[Error] ${cell.answer}`);
      return escapeCSV(cell.answer);
    });
    return [escapeCSV(dealId), ...dealCells].join(",");
  });

  // Synthesis row (if present)
  if (cells[SYNTHESIS_DEAL_ID]) {
    const synthCells = queries.map((q) => {
      const cell = cells[SYNTHESIS_DEAL_ID]?.[q];
      if (!cell || cell.status === "loading") return "";
      if (cell.status === "error") return escapeCSV(`[Error] ${cell.answer}`);
      return escapeCSV(cell.answer);
    });
    rows.push([escapeCSV("Synthesis"), ...synthCells].join(","));
  }

  const csv = [header, ...rows].join("\n");

  // Download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vyntic-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
