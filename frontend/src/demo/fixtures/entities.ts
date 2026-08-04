import type { Deal, Manager, DocumentMetadata } from "@/lib/api";
import { registerDemoRoutes } from "@/demo/transport";

export const DEMO_MANAGER_ID = "brightwater_capital";
export const DEMO_FUND_IV_ID = "brightwater_iv";
export const DEMO_FUND_III_ID = "brightwater_iii";

export const DEMO_MANAGER: Manager = {
  manager_id: DEMO_MANAGER_ID,
  name: "Brightwater Capital Partners, LLC",
  description:
    "Chicago-based North American industrials and business services manager, founded 2009, ~$2.1B AUM. Fictional demo GP.",
  tags: ["Buyout", "Industrials"],
  fund_count: 2,
};

export const DEMO_DEALS: Deal[] = [
  {
    deal_id: DEMO_FUND_IV_ID,
    name: "Brightwater Capital Partners IV",
    description:
      "2026 vintage, $1.25B target / $1.5B hard cap. Fund IV selection diligence.",
    document_count: 7,
    stage: "Diligence",
    tags: ["Industrials"],
    entity_type: "fund",
    manager_id: DEMO_MANAGER_ID,
    manager_name: DEMO_MANAGER.name,
    vintage: 2026,
    strategy: "Buyout",
  },
  {
    deal_id: DEMO_FUND_III_ID,
    name: "Brightwater Capital Partners III",
    description:
      "2021 vintage, $850M. Glenmoor holds a $25M commitment; active monitoring.",
    document_count: 6,
    stage: "Monitoring",
    tags: ["Industrials"],
    entity_type: "fund",
    manager_id: DEMO_MANAGER_ID,
    manager_name: DEMO_MANAGER.name,
    vintage: 2021,
    strategy: "Buyout",
  },
];

function doc(
  docId: string,
  dealId: string,
  filename: string,
  category: string,
  scope: "entity" | "manager",
  pageCount: number,
  chunkCount: number,
  period: string | null = null
): DocumentMetadata {
  return {
    doc_id: docId,
    deal_id: dealId,
    filename,
    page_count: pageCount,
    chunk_count: chunkCount,
    doc_category: category,
    period,
    scope,
  };
}

export const DEMO_DOCUMENTS: Record<string, DocumentMetadata[]> = {
  [DEMO_FUND_IV_ID]: [
    doc("brightwater_iv_272f20ae", DEMO_FUND_IV_ID, "brightwater_iv_lpa.pdf", "lpa", "entity", 20, 38),
    doc("brightwater_iv_17662bde", DEMO_FUND_IV_ID, "brightwater_iv_ddq.pdf", "ddq", "entity", 20, 27),
    doc("brightwater_iv_30511ab4", DEMO_FUND_IV_ID, "brightwater_iv_ppm.pdf", "ppm", "entity", 12, 32),
    doc("brightwater_iv_105b4aa6", DEMO_FUND_IV_ID, "brightwater_iv_pitchbook.pdf", "pitchbook", "entity", 10, 10),
    doc("brightwater_iv_c7b8f464", DEMO_FUND_IV_ID, "brightwater_adv_part2a.pdf", "form_adv", "manager", 10, 19),
    doc("brightwater_iv_7e4ab4bd", DEMO_FUND_IV_ID, "brightwater_valuation_policy.pdf", "valuation_policy", "manager", 6, 12),
    doc("brightwater_iv_d55228ad", DEMO_FUND_IV_ID, "brightwater_track_record.xlsx", "track_record", "manager", 1, 1),
  ],
  [DEMO_FUND_III_ID]: [
    doc("brightwater_iii_ec78209e", DEMO_FUND_III_ID, "glenmoor_fund_iii_side_letter.pdf", "side_letter", "entity", 4, 8),
    doc("brightwater_iii_c1e3a3a2", DEMO_FUND_III_ID, "glenmoor_fund_iii_pcap_q2_2026.pdf", "capital_account", "entity", 1, 3, "Q2 2026"),
    doc("brightwater_iii_3acd4432", DEMO_FUND_III_ID, "brightwater_iii_quarterly_q2_2026.pdf", "quarterly_report", "entity", 7, 15, "Q2 2026"),
    doc("brightwater_iii_5c5df72d", DEMO_FUND_III_ID, "brightwater_iii_audited_fs_2025.pdf", "financial_statements", "entity", 6, 12, "FY2025"),
    doc("brightwater_iii_25c17aae", DEMO_FUND_III_ID, "brightwater_iii_capital_call_07.pdf", "capital_call", "entity", 1, 2, "Q3 2026"),
    doc("brightwater_iii_f71c5a0e", DEMO_FUND_III_ID, "brightwater_iii_distribution_03.pdf", "distribution_notice", "entity", 1, 3, "Q3 2026"),
  ],
};

/** Flat filename → DocumentMetadata index, used by the static asset helper. */
export const DEMO_DOCS_BY_FILENAME: Record<string, DocumentMetadata> = Object.fromEntries(
  Object.values(DEMO_DOCUMENTS)
    .flat()
    .map((d) => [d.filename, d])
);

export function registerEntityFixtures(): void {
  registerDemoRoutes([
    { method: "GET", pattern: /^\/api\/deals$/, handler: () => DEMO_DEALS },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)$/,
      handler: (m) => DEMO_DEALS.find((d) => d.deal_id === m[1]) ?? DEMO_DEALS[0],
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/documents$/,
      handler: (m) => DEMO_DOCUMENTS[m[1]] ?? [],
    },
    { method: "GET", pattern: /^\/api\/managers$/, handler: () => [DEMO_MANAGER] },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)$/,
      handler: () => DEMO_MANAGER,
    },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)\/funds$/,
      handler: () => DEMO_DEALS,
    },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)\/documents$/,
      handler: () =>
        DEMO_DOCUMENTS[DEMO_FUND_IV_ID].filter((d) => d.scope === "manager"),
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/metadata\/stages$/,
      handler: () => ["Screening", "Diligence", "IC Review", "Committed", "Monitoring"],
    },
    { method: "GET", pattern: /^\/api\/deals\/metadata\/tags$/, handler: () => ["Industrials"] },
  ]);
}
