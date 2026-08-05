import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enableDemoMode, disableDemoMode } from "./mode";
import { buildDocumentViewUrl } from "./docUrl";

describe("buildDocumentViewUrl", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    disableDemoMode();
  });

  it("builds the authenticated API url outside demo mode", () => {
    expect(buildDocumentViewUrl("d1", "a.pdf", "tok", false, 3)).toBe(
      "/api/deals/d1/documents/a.pdf/view?token=tok"
    );
  });

  it("omits the token param when there is no token", () => {
    expect(buildDocumentViewUrl("d1", "a.pdf", null, false, 1)).toBe(
      "/api/deals/d1/documents/a.pdf/view"
    );
  });

  it("adds the sheet param for Excel outside demo mode", () => {
    expect(buildDocumentViewUrl("d1", "a.xlsx", "tok", true, 2)).toBe(
      "/api/deals/d1/documents/a.xlsx/view?token=tok&sheet=1"
    );
  });

  it("returns the flat static asset path in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_iv_ddq.pdf", null, false, 4)).toBe(
      "/demo-assets/docs/brightwater_iv_ddq.pdf"
    );
  });

  // The real backend converts a workbook to HTML server-side and never hands
  // the browser an .xlsx (routes_deals.py::_excel_to_html_response). Serving
  // the raw file in the demo is what produced a download prompt where the
  // product renders a table — and the recorded run cites this exact file.
  it("serves Excel as the pre-rendered sheet HTML in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_track_record.xlsx", null, true, 0)).toBe(
      "/demo-assets/docs/brightwater_track_record.html"
    );
  });

  // The pre-render carries every sheet, so there is nothing for ?sheet to
  // select — and a static file would ignore it anyway.
  it("drops the sheet param for Excel in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_track_record.xlsx", null, true, 2)).toBe(
      "/demo-assets/docs/brightwater_track_record.html"
    );
  });

  it("leaves non-Excel filenames alone in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_iv_lpa.pdf", null, false, 5)).toBe(
      "/demo-assets/docs/brightwater_iv_lpa.pdf"
    );
  });

  it("never nests demo assets under the /demo client route", () => {
    enableDemoMode();
    const url = buildDocumentViewUrl("d", "a.pdf", null, false, 1);
    expect(url.startsWith("/demo/")).toBe(false);
  });
});
