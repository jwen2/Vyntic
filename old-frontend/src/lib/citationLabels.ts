import type { Citation } from "@/lib/api";

const SPREADSHEET_FILE_RE = /\.(xlsx|xls|csv|tsv)$/i;

export function citationDocumentLabel(sourceFile: string, maxLength = 3): string {
  const filename = sourceFile.split(/[\\/]/).pop() || sourceFile;
  const stem = filename.replace(/\.[^.]+$/, "");

  const compact = stem.replace(/^[^A-Za-z0-9]+/, "").slice(0, 3);
  if (maxLength <= 3) return compact || filename.slice(0, 3) || "doc";

  const known =
    /cim|management\s*presentation/i.test(stem) ? "CIM" :
    /qoe|quality\s*of\s*earnings/i.test(stem) ? "QoE" :
    /legal/i.test(stem) ? "Legal DD" :
    /fin|model|financial/i.test(stem) || SPREADSHEET_FILE_RE.test(filename) ? "Financials" :
    /ops|operational/i.test(stem) ? "Ops DD" :
    stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (known.length <= maxLength) return known;
  return `${known.slice(0, Math.max(4, maxLength - 1)).trim()}…`;
}

export function citationLocator(citation: Citation): string {
  return `${SPREADSHEET_FILE_RE.test(citation.source_file) ? "sheet " : "p."}${citation.page}`;
}

export function citationReferenceLabel(citation: Citation, maxDocLength = 3): string {
  return `(${citationDocumentLabel(citation.source_file, maxDocLength)}, ${citationLocator(citation)})`;
}
