/**
 * Pre-built PE deal analysis question templates.
 * Organized by DD workstream for the deal workspace,
 * and kept as flat categories for the legacy matrix view.
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

/** DD Workstream identifiers */
export type WorkstreamId =
  | "financial"
  | "commercial"
  | "operational"
  | "legal"
  | "risk"
  | "documents";

export interface Workstream {
  id: WorkstreamId;
  name: string;
  icon: string;
  description: string;
  templates: QueryTemplate[];
}

// ---------------------------------------------------------------------------
// DD Workstream question packs (60+ questions across 4 workstreams)
// ---------------------------------------------------------------------------

export const DD_WORKSTREAMS: Workstream[] = [
  {
    id: "financial",
    name: "Financial DD",
    icon: "📊",
    description:
      "Revenue quality, margins, working capital, debt, and capital structure",
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
      {
        label: "Revenue quality & recurring vs. non-recurring",
        query:
          "What portion of revenue is recurring vs. non-recurring? Is there evidence of revenue quality issues such as one-time contracts, channel stuffing, or pull-forward effects?",
      },
      {
        label: "Working capital",
        query:
          "What is the working capital profile? Include days sales outstanding (DSO), days inventory outstanding (DIO), days payables outstanding (DPO), and the cash conversion cycle.",
      },
      {
        label: "Capital expenditures",
        query:
          "What are the capital expenditure levels (maintenance vs. growth capex) and how do they trend relative to revenue?",
      },
      {
        label: "Debt & capital structure",
        query:
          "What is the current debt structure? Include total debt, net debt, leverage ratios (Net Debt/EBITDA), interest coverage, and maturity schedule.",
      },
      {
        label: "Cash flow analysis",
        query:
          "What is the free cash flow profile? Show operating cash flow, capex, and FCF conversion rate. Are there any unusual cash flow items?",
      },
      {
        label: "Revenue cohort analysis",
        query:
          "Is there cohort-level revenue data available? Show how different customer cohorts or vintage years have performed over time.",
      },
      {
        label: "Unit economics",
        query:
          "What are the unit economics? Include customer acquisition cost (CAC), lifetime value (LTV), LTV/CAC ratio, and payback period if available.",
      },
      {
        label: "Seasonality & cyclicality",
        query:
          "Is there evidence of seasonality or cyclicality in the business? Show quarterly or monthly revenue patterns if available.",
      },
      {
        label: "Tax structure",
        query:
          "What is the effective tax rate and are there any notable tax attributes (NOLs, tax credits, transfer pricing arrangements)?",
      },
      {
        label: "Historical & projected financials",
        query:
          "Summarize the historical and projected financial performance. Show revenue, EBITDA, and margins for all available historical and forecast periods.",
      },
    ],
  },
  {
    id: "commercial",
    name: "Commercial DD",
    icon: "🏢",
    description:
      "Market sizing, competitive landscape, customer analysis, and pricing",
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
      {
        label: "Pricing power & strategy",
        query:
          "Is there evidence of pricing power? What is the pricing model, history of price increases, and customer response to price changes?",
      },
      {
        label: "Sales pipeline & backlog",
        query:
          "What is the sales pipeline, backlog, or order book? What is the conversion rate from pipeline to closed deals?",
      },
      {
        label: "Go-to-market strategy",
        query:
          "What is the go-to-market strategy? Describe the sales channels, sales cycle length, and customer acquisition approach.",
      },
      {
        label: "End-market diversification",
        query:
          "How diversified is the customer base across end-markets, verticals, or industries? Is there over-reliance on any single end-market?",
      },
      {
        label: "Contract structure",
        query:
          "What is the typical contract structure? Include contract duration, auto-renewal terms, termination provisions, and switching costs.",
      },
      {
        label: "Growth drivers",
        query:
          "What are the primary organic growth drivers? What new products, markets, or expansion initiatives are planned or underway?",
      },
      {
        label: "Win/loss analysis",
        query:
          "Is there win/loss data available? What are the primary reasons for winning and losing deals against competitors?",
      },
      {
        label: "Customer satisfaction",
        query:
          "What customer satisfaction data is available? Include NPS scores, customer surveys, or qualitative feedback if present.",
      },
      {
        label: "Geographic footprint",
        query:
          "What is the geographic footprint? Show revenue by region and identify expansion opportunities or geographic risks.",
      },
    ],
  },
  {
    id: "operational",
    name: "Operational DD",
    icon: "⚙️",
    description:
      "Management team, org structure, technology, and vendor dependencies",
    templates: [
      {
        label: "Management team assessment",
        query:
          "Who are the key members of the management team? What is their tenure, background, and track record? Are there any gaps in the leadership team?",
      },
      {
        label: "Key person risk",
        query:
          "Is there key person dependency? Which individuals are critical to operations and what would happen if they departed?",
      },
      {
        label: "Organizational structure",
        query:
          "What is the organizational structure? How many employees by function (sales, engineering, operations, G&A)? What is the employee growth trend?",
      },
      {
        label: "Employee retention & culture",
        query:
          "What are the employee retention metrics? Include turnover rates, tenure data, and any indicators of cultural health (Glassdoor ratings, employee surveys).",
      },
      {
        label: "Technology & IT systems",
        query:
          "What technology stack and IT systems are in place? Are there any legacy system risks, technical debt, or planned migrations?",
      },
      {
        label: "Vendor & supplier dependencies",
        query:
          "What are the key vendor and supplier relationships? Is there concentration risk with any single supplier? What are the contract terms?",
      },
      {
        label: "Operational efficiency & KPIs",
        query:
          "What are the key operational KPIs and efficiency metrics? How do they compare to industry benchmarks?",
      },
      {
        label: "Scalability assessment",
        query:
          "How scalable is the current operating model? What investments (people, systems, infrastructure) would be needed to support 2-3x growth?",
      },
      {
        label: "Facilities & real estate",
        query:
          "What is the facilities footprint? Include lease terms, capacity utilization, and any planned expansions or consolidations.",
      },
      {
        label: "Supply chain & logistics",
        query:
          "What does the supply chain look like? Identify any single points of failure, lead time risks, or geographic concentration.",
      },
      {
        label: "Insurance coverage",
        query:
          "What insurance coverage is in place? Are there any gaps in coverage or notable claims history?",
      },
      {
        label: "ESG & sustainability",
        query:
          "What is the company's ESG (Environmental, Social, Governance) profile? Are there any environmental liabilities or sustainability initiatives?",
      },
      {
        label: "Value creation opportunities",
        query:
          "What are the key value creation levers — pricing optimization, cost reduction, operational improvements, add-on M&A, or technology-driven efficiencies?",
      },
    ],
  },
  {
    id: "legal",
    name: "Legal DD",
    icon: "⚖️",
    description:
      "Litigation, contracts, intellectual property, and regulatory compliance",
    templates: [
      {
        label: "Pending litigation",
        query:
          "Are there any pending litigation matters, threatened claims, or material disputes? What is the estimated exposure and likelihood of adverse outcomes?",
      },
      {
        label: "Contingent liabilities",
        query:
          "Are there any contingent liabilities, off-balance-sheet obligations, or guarantees that could create future financial exposure?",
      },
      {
        label: "Regulatory compliance",
        query:
          "What is the regulatory environment? Are there any compliance gaps, pending regulatory actions, or upcoming regulation changes that could impact the business?",
      },
      {
        label: "Intellectual property",
        query:
          "What intellectual property does the company own (patents, trademarks, trade secrets, copyrights)? Are there any IP disputes or licensing risks?",
      },
      {
        label: "Material contracts review",
        query:
          "What are the most material contracts? Identify any change-of-control provisions, exclusivity clauses, or unfavorable terms that could impact a transaction.",
      },
      {
        label: "Employment & labor",
        query:
          "Are there any employment-related risks — pending labor disputes, union relationships, non-compete enforceability, or benefits obligations?",
      },
      {
        label: "Data privacy & cybersecurity",
        query:
          "What is the company's data privacy and cybersecurity posture? Are there any past data breaches, GDPR/CCPA compliance issues, or pending investigations?",
      },
      {
        label: "Environmental liabilities",
        query:
          "Are there any environmental liabilities, remediation obligations, or pending environmental investigations?",
      },
      {
        label: "Tax compliance & risks",
        query:
          "Are there any open tax audits, transfer pricing risks, or potential tax liabilities? Are all tax filings current?",
      },
      {
        label: "Corporate governance",
        query:
          "What is the corporate governance structure? Review board composition, voting rights, minority protections, and any related-party transactions.",
      },
      {
        label: "Permits & licenses",
        query:
          "What permits, licenses, and approvals are required to operate? Are all current? Are there any at risk of non-renewal?",
      },
      {
        label: "Anti-bribery & FCPA",
        query:
          "Is there any exposure to anti-bribery or FCPA risks? Are there adequate compliance programs in place for international operations?",
      },
    ],
  },
  {
    id: "risk",
    name: "Risk Scorecard",
    icon: "🚦",
    description:
      "Automated risk scoring across key dimensions with red/yellow/green indicators",
    templates: [
      {
        label: "Revenue quality risk",
        query:
          "Assess the REVENUE QUALITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: recurring vs. non-recurring mix, customer concentration, revenue volatility, and sustainability. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Customer concentration risk",
        query:
          "Assess the CUSTOMER CONCENTRATION risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: top customer revenue share, customer diversification, contract stability, and churn risk. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Management & key person risk",
        query:
          "Assess the MANAGEMENT & KEY PERSON risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: leadership depth, key person dependencies, succession planning, tenure, and track record. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Margin sustainability risk",
        query:
          "Assess the MARGIN SUSTAINABILITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: gross margin trends, cost structure, pricing power, input cost exposure, and competitive pressure on margins. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Regulatory & compliance risk",
        query:
          "Assess the REGULATORY & COMPLIANCE risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: regulatory environment, pending enforcement actions, compliance gaps, licensing requirements, and upcoming regulation changes. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Litigation risk",
        query:
          "Assess the LITIGATION risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: pending lawsuits, historical claims, contingent liabilities, and potential exposure amounts. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Capital intensity risk",
        query:
          "Assess the CAPITAL INTENSITY risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: capex requirements, maintenance vs. growth capex, asset-heavy vs. asset-light model, and free cash flow conversion. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Technology & obsolescence risk",
        query:
          "Assess the TECHNOLOGY & OBSOLESCENCE risk on a scale of 1-5 (1=low risk, 5=critical risk). Consider: technical debt, legacy system dependencies, competitive tech landscape, and R&D investment adequacy. Provide your score, a one-sentence justification, and list the top 2-3 supporting data points from the documents.",
      },
      {
        label: "Overall risk summary",
        query:
          "Provide an EXECUTIVE RISK SUMMARY for this deal. Synthesize all risk dimensions (revenue quality, customer concentration, management depth, margin sustainability, regulatory exposure, litigation, capital intensity, technology) into a one-page assessment. For each dimension, assign a risk level (Low/Medium/High) with a traffic-light color (Green/Yellow/Red). End with an overall risk rating and the top 3 risks that require immediate attention or mitigation.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Legacy flat categories (used by the matrix comparison view)
// ---------------------------------------------------------------------------

export const QUERY_TEMPLATES: TemplateCategory[] = [
  {
    name: "Financials",
    icon: "📊",
    templates: DD_WORKSTREAMS[0].templates.slice(0, 5),
  },
  {
    name: "Risk & Diligence",
    icon: "⚠️",
    templates: [
      DD_WORKSTREAMS[1].templates[2], // Customer concentration
      DD_WORKSTREAMS[3].templates[0], // Pending litigation
      DD_WORKSTREAMS[2].templates[1], // Key person risk
      DD_WORKSTREAMS[3].templates[1], // Contingent liabilities
    ],
  },
  {
    name: "Commercial",
    icon: "🏢",
    templates: DD_WORKSTREAMS[1].templates.slice(0, 4),
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
