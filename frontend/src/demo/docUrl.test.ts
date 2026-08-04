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

  it("keeps the sheet param for Excel in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_track_record.xlsx", null, true, 2)).toBe(
      "/demo-assets/docs/brightwater_track_record.xlsx?sheet=1"
    );
  });

  it("never nests demo assets under the /demo client route", () => {
    enableDemoMode();
    const url = buildDocumentViewUrl("d", "a.pdf", null, false, 1);
    expect(url.startsWith("/demo/")).toBe(false);
  });
});
