export type ColumnFormat =
  | "text"
  | "bulleted_list"
  | "number"
  | "percentage"
  | "monetary_amount"
  | "currency"
  | "yes_no"
  | "date"
  | "tag";

export interface MatrixColumnConfig {
  id: string;
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags?: string[];
}

export interface ColumnPreset {
  name: string;
  matches: RegExp;
  prompt: string;
  format: ColumnFormat;
  tags?: string[];
}

export const FORMAT_OPTIONS: Array<{ value: ColumnFormat; label: string; short: string }> = [
  { value: "text", label: "Free text", short: "Text" },
  { value: "bulleted_list", label: "Bulleted list", short: "List" },
  { value: "number", label: "Number", short: "123" },
  { value: "percentage", label: "Percentage", short: "%" },
  { value: "monetary_amount", label: "Monetary amount", short: "$" },
  { value: "currency", label: "Currency", short: "FX" },
  { value: "yes_no", label: "Yes / No", short: "Y/N" },
  { value: "date", label: "Date", short: "Date" },
  { value: "tag", label: "Tag", short: "Tag" },
];

export const TAG_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
];

const CURRENCY_COLORS: Record<string, string> = {
  USD: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  EUR: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  GBP: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  JPY: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  CAD: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  AUD: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  CNY: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

export const PE_COLUMN_PRESETS: ColumnPreset[] = [
  {
    name: "Revenue",
    matches: /\brevenue\b|\bsales\b/i,
    format: "monetary_amount",
    prompt: "Extract the most relevant revenue figure or revenue trend. State the period, amount, and whether growth is accelerating or decelerating if the document provides enough detail.",
  },
  {
    name: "EBITDA",
    matches: /\bebitda\b|\badjusted earnings\b/i,
    format: "monetary_amount",
    prompt: "Extract EBITDA and adjusted EBITDA if available. Distinguish reported versus adjusted figures and call out the period covered.",
  },
  {
    name: "EBITDA Margin",
    matches: /\bmargin\b|\bebitda margin\b/i,
    format: "percentage",
    prompt: "Extract the EBITDA margin or gross margin most relevant to the document. Include the period and state whether the margin expanded or contracted if disclosed.",
  },
  {
    name: "Customer Concentration",
    matches: /\bcustomer concentration\b|\btop customers?\b|\btop 10\b/i,
    format: "text",
    prompt: "Identify customer concentration. Extract the percentage or revenue share represented by the largest customer and top customers, plus any disclosed churn or contract risk.",
  },
  {
    name: "Recurring Revenue",
    matches: /\brecurring\b|\barr\b|\bsubscription\b/i,
    format: "percentage",
    prompt: "Extract recurring revenue, ARR, subscription revenue, or contracted revenue metrics. State the metric, amount or percentage, period, and why it matters for revenue quality.",
  },
  {
    name: "Net Retention",
    matches: /\bnet retention\b|\bnrr\b|\bndr\b|\bgross retention\b/i,
    format: "percentage",
    prompt: "Extract net revenue retention, gross retention, churn, or renewal metrics. State the period and whether the metric supports or weakens the investment thesis.",
  },
  {
    name: "Capex Intensity",
    matches: /\bcapex\b|\bcapital expenditure\b|\bmaintenance capex\b/i,
    format: "text",
    prompt: "Extract capex requirements and capex as a percentage of revenue if available. Distinguish growth capex from maintenance capex when disclosed.",
  },
  {
    name: "Debt / Leverage",
    matches: /\bdebt\b|\bleverage\b|\bcovenant\b/i,
    format: "text",
    prompt: "Extract debt, leverage, covenant, or refinancing information. State the amount, metric, maturity, and any covenant headroom or risk described.",
  },
  {
    name: "Red Flags",
    matches: /\bred flags?\b|\brisk\b|\bconcern\b/i,
    format: "bulleted_list",
    prompt: "List investment-relevant red flags found in the document. Focus on revenue quality, margin sustainability, customer churn, litigation, management depth, compliance, and one-time EBITDA adjustments.",
  },
  {
    name: "Investment Thesis Fit",
    matches: /\bthesis\b|\binvestment fit\b|\bfit\b/i,
    format: "tag",
    tags: ["Strong", "Mixed", "Weak", "Not disclosed"],
    prompt: "Classify how strongly this document supports the investment thesis. Choose one tag and briefly cite the strongest supporting evidence.",
  },
];

export function getFormatLabel(format: ColumnFormat): string {
  return FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? "Free text";
}

export function getFormatShort(format: ColumnFormat): string {
  return FORMAT_OPTIONS.find((option) => option.value === format)?.short ?? "Text";
}

export function getPresetConfig(label: string): Pick<ColumnPreset, "prompt" | "format" | "tags"> | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const preset = PE_COLUMN_PRESETS.find(({ matches }) => matches.test(trimmed));
  if (!preset) return null;
  return { prompt: preset.prompt, format: preset.format, tags: preset.tags };
}

export function buildFallbackPrompt(label: string, format: ColumnFormat = "text", tags?: string[]): string {
  const base = `Extract "${label}" from this document for a private-equity diligence review. Focus on decision-relevant facts, state the period or scope, and cite the exact supporting language.`;
  if (format === "tag" && tags?.length) {
    return `${base} Choose exactly one label from: ${tags.join(", ")}.`;
  }
  return base;
}

export function createColumnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `col_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getPillClass(content: string, column?: Pick<MatrixColumnConfig, "format" | "tags">): string {
  if (column?.format === "yes_no") {
    const lower = content.toLowerCase();
    if (lower === "yes") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
    if (lower === "no") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }
  if (column?.format === "currency") {
    return CURRENCY_COLORS[content.toUpperCase()] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
  if (column?.format === "tag" && column.tags?.length) {
    const idx = column.tags.findIndex((tag) => tag.toLowerCase() === content.toLowerCase());
    if (idx >= 0) return TAG_COLORS[idx % TAG_COLORS.length];
  }
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}
