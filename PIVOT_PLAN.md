# Vyntic Pivot Roadmap: AI-Powered Due Diligence Platform for PE Firms

## Context

Vyntic currently operates as a **multi-deal comparison matrix** — PE analysts upload docs for multiple deals and ask cross-deal questions to get side-by-side answers. The pivot recognizes that PE firms spend the vast majority of their time doing **deep due diligence on a single deal at a time**, not comparing deals. The comparison matrix is a nice-to-have; the real pain point is the 60-90 day DD process where analysts drown in hundreds of documents across financial, legal, operational, and commercial workstreams.

**Competitive landscape:** Kairos by Brownloop is the main AI DD competitor — they offer multi-agent DD flows, risk scoring, IC memo generation, and portfolio monitoring. Vyntic's advantage is that we already have a working RAG pipeline, streaming UI, citation grounding, and document viewer. The pivot reorients these strengths toward single-deal depth rather than multi-deal breadth.

**Goal:** Transform Vyntic from "compare deals side-by-side" to "run comprehensive AI-powered due diligence on your current deal."

---

## Pivot Roadmap

### Phase 1: Single-Deal Deep Dive (Foundation Pivot)
_Shift the core UX from multi-deal matrix to single-deal workspace_

**What changes:**
- **New Deal Dashboard:** When you click into a deal, you land on a dedicated deal workspace (not the matrix). This is the new home screen per deal.
- **DD Workstream Tabs:** Replace the flat query list with structured workstream tabs:
  - Financial DD (revenue quality, EBITDA bridge, working capital, debt/cap structure)
  - Commercial DD (market sizing, competitive landscape, customer analysis, pricing)
  - Operational DD (management team, org structure, IT systems, vendor dependencies)
  - Legal DD (litigation, contracts, IP, regulatory/compliance)
  - Risk Summary (auto-generated risk scorecard across all workstreams)
- **Workstream Question Packs:** Each tab comes pre-loaded with 10-15 expert DD questions specific to that workstream (expand current 16 templates to ~60+ organized by workstream)
- **"Run Full Workstream" Button:** One-click to run all questions in a workstream against the deal's documents — batch RAG execution
- **Keep matrix as secondary feature:** Multi-deal comparison remains accessible but is no longer the landing page

---

### Phase 2: DD Risk Scorecard & Auto-Flagging
_Give every deal an at-a-glance risk profile_

- **Automated Risk Scorecard:** AI generates a risk score (1-5) per dimension: Revenue Quality, Customer Concentration, Management Depth, Margin Sustainability, Regulatory Exposure, Litigation Risk, Capital Intensity, Key Person Risk
- **Red/Yellow/Green Flags:** Visual traffic-light indicators on each risk dimension
- **Risk Summary Page:** One-page auto-generated executive risk summary with supporting citations
- **Anomaly Detection:** Flag inconsistencies across documents
- **Risk Trend Tracking:** As new documents are uploaded, risk scores update automatically

---

### Phase 3: IC Memo Generator
_Auto-generate Investment Committee materials from DD findings_

- **One-Click IC Memo:** Generate a structured investment memo (Executive Summary, Company Overview, Investment Highlights, Key Risks & Mitigants, Financial Summary, Valuation Considerations, Recommendation)
- **Export as PDF/DOCX:** Formatted, branded output ready for IC distribution
- **Editable Draft:** Analysts can modify before finalizing
- **Citation Trail:** Every claim links back to source documents

---

### Phase 4: Data Room Intelligence
_Make document ingestion smarter and more PE-specific_

- **Auto-Classification:** AI auto-tags documents by type (CIM, Financial Model, QofE Report, Management Presentation, Legal Agreement, etc.)
- **Document Completeness Checker:** Flag missing DD documents against a standard checklist
- **Smart Chunking by Document Type:** Different chunking strategies per doc type
- **Data Room Summary:** Auto-generated overview of what's uploaded, what's missing

---

### Phase 5: DD Workflow & Collaboration
_Turn Vyntic from an analysis tool into a workflow platform_

- **DD Checklist Tracker:** ~100 standard DD items across workstreams, auto-checked as questions are answered
- **Workstream Status:** Track completion % per workstream
- **Notes & Annotations:** Add notes to AI answers, flag for follow-up
- **Management Q&A Prep:** Collect unanswered questions into a prep list
- **Activity Timeline:** Chronological log of all DD activities
- **Multi-user Support:** Authentication + team-based access

---

### Phase 6: Advanced Analytics & Intelligence
_Differentiate with PE-specific AI capabilities_

- **Comparable Deal Benchmarking** against historical deals
- **Sensitivity Analysis** (entry multiple vs. growth rate, leverage vs. IRR)
- **Cohort & Retention Analysis** for recurring revenue businesses
- **EBITDA Bridge Builder** from raw financials
- **Market Intelligence** with external data enrichment

---

### Phase 7: Production & Enterprise
_Scale for real PE firm deployment_

- **Authentication & RBAC** (Partner, VP, Associate, Analyst permission levels)
- **Audit Trail** for compliance
- **SSO/SAML** for enterprise
- **PostgreSQL + Pinecone migration**
- **SOC 2 compliance path**
- **White-label / Custom branding**
- **API access** for DealCloud, Altvia integration

---

## Implementation Priority

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| **Phase 1: Single-Deal Deep Dive** | 1-2 weeks | Foundational | **NOW** |
| **Phase 2: Risk Scorecard** | 1 week | High — "wow" feature | **Next** |
| **Phase 3: IC Memo Generator** | 1 week | High — tangible deliverable | **Next** |
| **Phase 4: Data Room Intelligence** | 1-2 weeks | Medium-High | **Soon** |
| **Phase 5: DD Workflow** | 2-3 weeks | High — platform stickiness | **Soon** |
| **Phase 6: Advanced Analytics** | 2-4 weeks | Medium — differentiator | **Later** |
| **Phase 7: Production** | 3-5 weeks | Required for deployment | **Later** |
