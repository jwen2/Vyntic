/**
 * Pre-built PE deal analysis question templates.
 * Grouped by category for easy browsing.
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

export const QUERY_TEMPLATES: TemplateCategory[] = [
  {
    name: "Financials",
    icon: "📊",
    templates: [
      {
        label: "Revenue breakdown",
        query: "What is the revenue breakdown by segment, product, or geography? Include growth rates for each.",
      },
      {
        label: "EBITDA & margins",
        query: "What is the EBITDA and what are the key margin trends over the available periods? Distinguish adjusted vs. unadjusted.",
      },
      {
        label: "Revenue growth",
        query: "What is the historical revenue growth rate? Is growth accelerating or decelerating?",
      },
      {
        label: "Capital expenditures",
        query: "What are the capital expenditure levels and how do they trend relative to revenue?",
      },
      {
        label: "Working capital",
        query: "What is the working capital profile? Include days sales outstanding, inventory turns, and payables.",
      },
    ],
  },
  {
    name: "Risk & Diligence",
    icon: "⚠️",
    templates: [
      {
        label: "Customer concentration",
        query: "What is the customer concentration? What percentage of revenue comes from the top 5 and top 10 customers?",
      },
      {
        label: "Key risks",
        query: "What are the key risks and red flags identified in the documents? Include regulatory, operational, and financial risks.",
      },
      {
        label: "Key person risk",
        query: "Is there key person dependency? What is the management team depth and tenure?",
      },
      {
        label: "Litigation & liabilities",
        query: "Are there any pending litigation, contingent liabilities, or off-balance-sheet obligations?",
      },
    ],
  },
  {
    name: "Commercial",
    icon: "🏢",
    templates: [
      {
        label: "Market position",
        query: "What is the company's market position and competitive landscape? Who are the main competitors?",
      },
      {
        label: "Customer retention",
        query: "What are the customer retention and churn metrics? Include net revenue retention if available.",
      },
      {
        label: "Pricing power",
        query: "Is there evidence of pricing power? What is the pricing strategy and history of price increases?",
      },
      {
        label: "Growth drivers",
        query: "What are the primary organic growth drivers and what is the pipeline or backlog?",
      },
    ],
  },
  {
    name: "Deal Thesis",
    icon: "💡",
    templates: [
      {
        label: "Investment highlights",
        query: "What are the top 3-5 investment highlights that make this an attractive acquisition target?",
      },
      {
        label: "Value creation levers",
        query: "What are the potential value creation levers — pricing, cost optimization, add-on M&A, or operational improvements?",
      },
      {
        label: "Deal summary",
        query: "Provide a concise deal summary: what the company does, its financial profile, and key investment considerations.",
      },
    ],
  },
];
