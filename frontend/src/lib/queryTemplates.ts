/**
 * Pre-built PE deal analysis question templates used by the legacy matrix
 * comparison view (DocMatrixPanel, MatrixGrid).
 *
 * NOTE: The DD workstream packs (Financial / Commercial / Operational / Legal /
 * Risk / Proactive Scan) used to live here as `DD_WORKSTREAMS`. They were
 * migrated into built-in workflow templates in `backend/app/services/workflow_seed.py`
 * when the Workstreams tab was retired (PR #79). The four matrix categories
 * below are kept as standalone suggestion lists for the matrix comparison UI;
 * they are not wired into any workstream/workflow execution path.
 */

export interface QueryTemplate {
  label: string;
  query: string;
}

export interface TemplateCategory {
  name: string;
  icon: string;
  templates: QueryTemplate[];
}

// ---------------------------------------------------------------------------
// Flat categories used by the matrix comparison view
// ---------------------------------------------------------------------------

export const QUERY_TEMPLATES: TemplateCategory[] = [
  {
    name: "Financials",
    icon: "📊",
    templates: [
      {
        label: "Revenue breakdown",
        query:
          "What is the revenue breakdown by segment, product, or geography? Include growth rates for each.",
      },
      {
        label: "EBITDA & margins",
        query:
          "What is the EBITDA and what are the key margin trends over the available periods? Distinguish adjusted vs. unadjusted.",
      },
      {
        label: "Revenue growth trajectory",
        query:
          "What is the historical revenue growth rate? Is growth accelerating or decelerating? Show the trend over all available periods.",
      },
      {
        label: "EBITDA bridge / adjustments",
        query:
          "What are the EBITDA adjustments and add-backs? List each adjustment with its dollar amount and rationale. What is the gap between reported and adjusted EBITDA?",
      },
      {
        label: "Gross margin analysis",
        query:
          "What is the gross margin profile and how has it trended? Identify the key drivers of gross margin expansion or compression.",
      },
    ],
  },
  {
    name: "Risk & Diligence",
    icon: "⚠️",
    templates: [
      {
        label: "Customer concentration",
        query:
          "What is the customer concentration? What percentage of revenue comes from the top 5, top 10, and top 20 customers? Have any major customers been lost recently?",
      },
      {
        label: "Pending litigation",
        query:
          "Are there any pending litigation matters, threatened claims, or material disputes? What is the estimated exposure and likelihood of adverse outcomes?",
      },
      {
        label: "Key person risk",
        query:
          "Is there key person dependency? Which individuals are critical to operations and what would happen if they departed?",
      },
      {
        label: "Contingent liabilities",
        query:
          "Are there any contingent liabilities, off-balance-sheet obligations, or guarantees that could create future financial exposure?",
      },
    ],
  },
  {
    name: "Commercial",
    icon: "🏢",
    templates: [
      {
        label: "Market size & TAM",
        query:
          "What is the total addressable market (TAM), serviceable addressable market (SAM), and serviceable obtainable market (SOM)? What is the expected market growth rate?",
      },
      {
        label: "Competitive landscape",
        query:
          "What is the competitive landscape? Who are the main competitors, their relative market shares, and key differentiators?",
      },
      {
        label: "Customer concentration",
        query:
          "What is the customer concentration? What percentage of revenue comes from the top 5, top 10, and top 20 customers? Have any major customers been lost recently?",
      },
      {
        label: "Customer retention & churn",
        query:
          "What are the customer retention and churn metrics? Include gross retention, net revenue retention (NRR), logo churn, and dollar churn if available.",
      },
    ],
  },
  {
    name: "Deal Thesis",
    icon: "💡",
    templates: [
      {
        label: "Investment highlights",
        query:
          "What are the top 3-5 investment highlights that make this an attractive acquisition target?",
      },
      {
        label: "Value creation levers",
        query:
          "What are the potential value creation levers — pricing, cost optimization, add-on M&A, or operational improvements?",
      },
      {
        label: "Deal summary",
        query:
          "Provide a concise deal summary: what the company does, its financial profile, and key investment considerations.",
      },
    ],
  },
];
