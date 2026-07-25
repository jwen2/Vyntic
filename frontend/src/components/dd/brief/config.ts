// Shared types and static configuration for the deal/fund brief.
// Extracted verbatim from DealBriefDashboard.tsx (FE5.2) — no behaviour change.

import type { Citation } from "@/lib/api";
import type { TabularCell } from "@/lib/workflows";

// Local shape mirrors the old WorkstreamPanel.QuestionResult — the brief's
// parsing/rendering code below was written against this interface and was
// kept verbatim when the Workstreams tab was retired.
export interface QuestionResult {
  answer: string;
  /**
   * The cell's typed `answer_formatted`. KV panels (snapshot/transaction) read
   * `pairs` and the list panel (next actions) reads `items` directly from here;
   * prose panels fall back to `answer`.
   */
  formatted?: TabularCell["answer_formatted"];
  citations: (Citation | null)[];
  status: "pending" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
  completed_at?: number;
}

// Local shape mirrors the old Workstream type. The brief only uses
// `templates` for label/query lookups.
export interface BriefTemplate { label: string; query: string }

export interface BriefWorkstreamShim { id: "proactive_scan"; templates: BriefTemplate[] }

export const PROACTIVE_SCAN_WORKFLOW_ID = "builtin_proactive_scan";

export type OverrideStore = Record<string, Record<string, string>>;

export const OVERRIDE_KEY_PREFIX = "vyntic_brief_overrides_";

export const DIFF_KEY_PREFIX = "vyntic_brief_diff_";

export interface BriefField {
  label: string;
  value: string;
  sourceIdx?: number;
  override?: boolean;
}

export interface Metric {
  label: string;
  value: string;
  context: string;
}

export interface ThesisBullet {
  text: string;
  sourceIdx?: number;
}

export interface ThesisSections {
  thesis: ThesisBullet[];
  levers: ThesisBullet[];
  exit: ThesisBullet[];
  risks: ThesisBullet[];
}

export interface FinancialTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export type FinancialView = "annual" | "quarterly" | "metrics";

export interface ChartPoint {
  period: string;
  value: number;
  display: string;
}

export interface ChartSeries {
  label: string;
  values: ChartPoint[];
}

export const DEAL_SNAPSHOT_LABEL = "Deal snapshot";

export const PROPOSED_TRANSACTION_LABEL = "Proposed transaction";

export const FINANCIAL_HIGHLIGHTS_LABEL = "Key financial highlights";

export const INVESTMENT_THESIS_LABEL = "Investment thesis";

export const NEXT_ACTIONS_LABEL = "Analyst next actions";

export const SNAPSHOT_FIELDS = [
  "Target",
  "Company",
  "Sector",
  "Business model",
  "Geography",
  "Seller",
  "Stage",
];

export const TRANSACTION_FIELDS = [
  "Transaction type",
  "Purchase price",
  "Enterprise value",
  "Ownership",
  "Valuation",
  "Financing",
  "Timing",
];

export const FUND_SNAPSHOT_FIELDS = [
  "Manager",
  "Fund",
  "Vintage",
  "Strategy",
  "Target size",
  "Hard cap",
  "Geography",
  "Raise stage",
];

export const FUND_TERMS_FIELDS = [
  "Management fee",
  "Carried interest",
  "Preferred return",
  "Waterfall",
  "GP commitment",
  "Fee offset",
  "Key person",
  "Term",
];

// Entity-aware brief configuration. The buyout Deal Brief and the LP Fund Brief
// share the same dashboard machinery; only the workflow id, the two kv panels'
// column-labels / field-lists / titles, the financial-highlights column label,
// and the copy differ. `snapshotLabel`/`transactionLabel`/`financialLabel` must
// equal the seed column labels exactly (resultByLabel matches on label).
export interface BriefEntityConfig {
  workflowId: string;
  runLabel: string;
  snapshotLabel: string;
  snapshotTitle: string;
  snapshotFields: string[];
  transactionLabel: string;
  transactionTitle: string;
  transactionDiffLabel: string;
  transactionFields: string[];
  financialLabel: string;
  financialTabLabel: string;
}

export const BRIEF_CONFIG: Record<"deal" | "fund", BriefEntityConfig> = {
  deal: {
    workflowId: PROACTIVE_SCAN_WORKFLOW_ID,
    runLabel: "Deal Brief",
    snapshotLabel: DEAL_SNAPSHOT_LABEL,
    snapshotTitle: "What is the deal?",
    snapshotFields: SNAPSHOT_FIELDS,
    transactionLabel: PROPOSED_TRANSACTION_LABEL,
    transactionTitle: "What is being proposed?",
    transactionDiffLabel: "Proposed Transaction",
    transactionFields: TRANSACTION_FIELDS,
    financialLabel: FINANCIAL_HIGHLIGHTS_LABEL,
    financialTabLabel: "Annual",
  },
  fund: {
    workflowId: "builtin_lp_fund_brief",
    runLabel: "Fund Brief",
    snapshotLabel: "Fund snapshot",
    snapshotTitle: "About the fund",
    snapshotFields: FUND_SNAPSHOT_FIELDS,
    transactionLabel: "Terms at a glance",
    transactionTitle: "Terms at a glance",
    transactionDiffLabel: "Terms",
    transactionFields: FUND_TERMS_FIELDS,
    financialLabel: "Key performance data",
    financialTabLabel: "Track record",
  },
};

export const METRIC_KEYWORDS = [
  "Revenue",
  "ARR",
  "MRR",
  "Gross margin",
  "EBITDA",
  "Adjusted EBITDA",
  "EBITDA margin",
  "Growth",
  "Net revenue retention",
  "NRR",
  "Churn",
  "Capex",
  "Free cash flow",
  "FCF",
  "Net debt",
  "Working capital",
  "Customer concentration",
];

export const VALUE_PATTERN = /(?:[$€£]\s?\d[\d,.]*(?:\s?(?:m|mm|bn|k))?|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?x)/gi;
