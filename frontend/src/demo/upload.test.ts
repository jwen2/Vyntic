import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_UPLOAD_REFUSAL,
  uploadDocument,
  uploadDocumentsBatch,
} from "@/lib/api";
import { disableDemoMode, enableDemoMode } from "./mode";

/**
 * The upload path is the one request in the app that never passes through
 * `fetchWrapper`: it uses `XMLHttpRequest` for upload-progress events, so the
 * demo transport cannot intercept it. A browser walk of the demo caught a real
 * `POST /api/deals/brightwater_iv/documents` leaving the page and hitting the
 * dev proxy — the only request in the whole walk that escaped.
 *
 * So these tests assert on the constructor, not on the promise: rejecting is
 * not enough if a request went out first. Counting constructions is the
 * strongest available proof that nothing left the browser.
 */
let constructed = 0;
let sent = 0;

class RecordingXhr {
  status = 200;
  responseText = "{}";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };

  constructor() {
    constructed += 1;
  }
  open(): void {}
  setRequestHeader(): void {}
  send(): void {
    sent += 1;
    this.onload?.();
  }
}

beforeEach(() => {
  constructed = 0;
  sent = 0;
  vi.stubGlobal("XMLHttpRequest", RecordingXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  disableDemoMode();
});

const file = () => new File(["ppm"], "fund-ppm.pdf", { type: "application/pdf" });

describe("uploads in demo mode", () => {
  it("never constructs an XMLHttpRequest for a single-file upload", async () => {
    enableDemoMode();
    await expect(uploadDocument("brightwater_iv", file())).rejects.toThrow(
      DEMO_UPLOAD_REFUSAL
    );
    expect(constructed).toBe(0);
    expect(sent).toBe(0);
  });

  it("never constructs an XMLHttpRequest for a batch upload", async () => {
    enableDemoMode();
    await expect(
      uploadDocumentsBatch("brightwater_iv", [file(), file()])
    ).rejects.toThrow(DEMO_UPLOAD_REFUSAL);
    expect(constructed).toBe(0);
    expect(sent).toBe(0);
  });

  it("rejects rather than resolving, so nothing reports a phantom success", async () => {
    enableDemoMode();
    const outcome = await uploadDocument("brightwater_iv", file()).then(
      () => "resolved",
      () => "rejected"
    );
    expect(outcome).toBe("rejected");
  });

  it("says why, and does not blame the user or the network", async () => {
    expect(DEMO_UPLOAD_REFUSAL).toContain("demo");
    expect(DEMO_UPLOAD_REFUSAL).not.toMatch(/failed|error/i);
  });
});

describe("uploads with the demo flag off", () => {
  it("still issues a real XMLHttpRequest — the guard is the only difference", async () => {
    await expect(uploadDocument("brightwater_iv", file())).resolves.toBeUndefined();
    expect(constructed).toBe(1);
    expect(sent).toBe(1);
  });

  it("still issues a real XMLHttpRequest for a batch upload", async () => {
    await expect(
      uploadDocumentsBatch("brightwater_iv", [file(), file()])
    ).resolves.toEqual({});
    expect(constructed).toBe(1);
    expect(sent).toBe(1);
  });
});
