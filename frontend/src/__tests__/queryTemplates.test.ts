/**
 * Tests for Phase 1, Feature 2: Query Templates.
 * Validates the template data structure and content.
 */
import { QUERY_TEMPLATES, TemplateCategory, QueryTemplate } from "../lib/queryTemplates";

describe("QUERY_TEMPLATES", () => {
  it("has at least 3 categories", () => {
    expect(QUERY_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it("each category has required fields", () => {
    for (const cat of QUERY_TEMPLATES) {
      expect(cat.name).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.templates.length).toBeGreaterThan(0);
    }
  });

  it("each template has a label and query", () => {
    for (const cat of QUERY_TEMPLATES) {
      for (const t of cat.templates) {
        expect(t.label).toBeTruthy();
        expect(t.query).toBeTruthy();
        expect(t.query.length).toBeGreaterThan(10); // non-trivial
      }
    }
  });

  it("has no duplicate labels across all categories", () => {
    const labels = QUERY_TEMPLATES.flatMap((c) => c.templates.map((t) => t.label));
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("includes Financials category", () => {
    const financials = QUERY_TEMPLATES.find((c) => c.name === "Financials");
    expect(financials).toBeDefined();
    expect(financials!.templates.length).toBeGreaterThanOrEqual(3);
  });

  it("includes Risk & Diligence category", () => {
    const risk = QUERY_TEMPLATES.find((c) => c.name === "Risk & Diligence");
    expect(risk).toBeDefined();
  });

  it("includes Deal Thesis category", () => {
    const thesis = QUERY_TEMPLATES.find((c) => c.name === "Deal Thesis");
    expect(thesis).toBeDefined();
  });

  it("all queries end with a question mark or period", () => {
    for (const cat of QUERY_TEMPLATES) {
      for (const t of cat.templates) {
        const lastChar = t.query.trim().slice(-1);
        expect(["?", "."]).toContain(lastChar);
      }
    }
  });
});
