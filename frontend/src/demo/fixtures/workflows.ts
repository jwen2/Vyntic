import type { Workflow, WorkflowColumn, WorkflowRun } from "@/lib/workflows";
import { registerDemoRoutes } from "@/demo/transport";
import { DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import recorded from "./recorded-ddq-scan-run.json";

/**
 * The DDQ Gap & Consistency Scan run recorded against the real Brightwater
 * corpus with a real model (scripts/record_demo_run.mjs, run 0a15ef21). Frozen
 * verbatim so the demo needs no LLM, no key and no backend at runtime — but
 * reads as genuine, because it is. Never hand-edit the JSON: recording rather
 * than authoring is what makes its 59 citations correct by construction.
 *
 * This cast is the one place a JSON import crosses into typed code. It is
 * checked at runtime by the field-by-field walker in workflows.test.ts, so a
 * re-recording that changes the API shape fails a test rather than a surface.
 */
export const DEMO_DDQ_RUN = recorded as unknown as WorkflowRun;

/**
 * One row, run one-click. `multi_doc_synthesis` built-ins default their single
 * row label to the workflow name when no synthesis questions are supplied
 * (routes_workflow_runs.py:116-120) — that default is what was recorded.
 */
export const DEMO_DDQ_ROWS: string[] = ["DDQ Gap & Consistency Scan"];

/**
 * Mirrors the built-in from workflow_seed_lp.py:25. Column ids are the real
 * `builtin_lp_ddq_scan` ids read from the seeded database; per CLAUDE.md
 * invariant 4 built-in column ids are stable across startup reconciliation, so
 * hardcoding them keeps `cell.column_id` resolving without inferring order from
 * the recorded cell sequence.
 *
 * All 12 columns are `markdown` with no tags — this workflow has no enum
 * column, so there is no Clean/Monitor/Red flag badge to stage.
 */
const DDQ_COLUMNS: ReadonlyArray<readonly [id: string, label: string]> = [
  ["4223f1f6938a46b9aa0be66a6044bf05", "Firm & Ownership"],
  ["68558a7e665548a28536c1b7f2a13314", "Team & Succession"],
  ["ef3ececba4894d829463c407cb2cd156", "Track Record"],
  ["dd0188ff630d467d9941ccf80d34a740", "Investment Strategy & Process"],
  ["a01ad37a06444c348b93de7cecd96e5f", "Fund Terms & Economics"],
  ["9814f84441844e788e44523b2002848c", "Valuation Policy"],
  ["9f181791b2a247a59135123e8b7de3d0", "Compliance & Regulatory"],
  ["b778bec0d4c84fb6b3ecc85a1c24f3fb", "IT & Cybersecurity"],
  ["f9b31fbd5a8842e0b1f339e5a456c7bd", "ESG"],
  ["8495ea4a16a74d1ca73fe891d5a8f9e5", "LP Base & References"],
  ["1b2486ce7b1b4480b5c2af0913241e38", "Conflicts of Interest"],
  ["634bbe4f41a84ce0b63d01a9b26bdbda", "Service Providers"],
] as const;

/** Every column shares one prompt with the section name substituted in. */
function columnPrompt(label: string): string {
  return (
    `Review the ${label.toUpperCase()} section across the DDQ and supporting materials. ` +
    "Summarize the answers, flag skipped or evasive responses, identify contradictions " +
    "with the PPM or pitchbook, and propose focused follow-up questions. Include " +
    '[Source N] citations for every supported claim; write "Not found" when the ' +
    "documents do not cover the section."
  );
}

const DDQ_WORKFLOW_COLUMNS: WorkflowColumn[] = DDQ_COLUMNS.map(([id, label], index) => ({
  id,
  order_index: index + 1,
  label,
  prompt: columnPrompt(label),
  format: "markdown",
  tags: null,
  is_derived: false,
  formula: null,
}));

export const DEMO_DDQ_WORKFLOW: Workflow = {
  id: "builtin_lp_ddq_scan",
  deal_id: null,
  entity_type: "fund",
  name: "DDQ Gap & Consistency Scan",
  description: "ILPA DDQ coverage, evasions, contradictions, and follow-up questions",
  type: "tabular",
  row_source: "multi_doc_synthesis",
  output_format: "excel",
  is_builtin: true,
  cloned_from: null,
  created_by: null,
  created_at: "2026-07-29T13:38:11.609493",
  updated_at: "2026-07-29T13:38:11.609493",
  stages: [],
  columns: DDQ_WORKFLOW_COLUMNS,
  variables: [],
};

export function registerWorkflowFixtures(): void {
  registerDemoRoutes([
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows$/,
      handler: () => [DEMO_DDQ_WORKFLOW],
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)$/,
      handler: () => DEMO_DDQ_WORKFLOW,
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)\/runs$/,
      // Fund IV shows the recorded run as run history; Fund III has none.
      handler: (m) => (m[1] === DEMO_FUND_IV_ID ? [DEMO_DDQ_RUN] : []),
    },
    {
      method: "GET",
      pattern: /^\/api\/runs\/([^/]+)$/,
      handler: () => DEMO_DDQ_RUN,
    },
    {
      method: "GET",
      // No caller in the app today (every run fetch goes through
      // lib/workflows.ts, which has no deal-level run list). Registered so a
      // deal-level "recent runs" surface cannot 404 into a blank panel.
      pattern: /^\/api\/deals\/([^/]+)\/runs$/,
      handler: (m) => (m[1] === DEMO_FUND_III_ID ? [] : [DEMO_DDQ_RUN]),
    },
  ]);
}
