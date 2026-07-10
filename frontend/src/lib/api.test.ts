import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  errorDetailFromText,
  request,
  UNAUTHORIZED_EVENT,
} from "./api";

function mockFetch(status: number, body: string, ok = status >= 200 && status < 300) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("errorDetailFromText", () => {
  it("prefers the JSON `detail` field", () => {
    expect(errorDetailFromText('{"detail":"Deal not found"}', 404)).toBe("Deal not found");
  });

  it("falls back to the JSON `message` field", () => {
    expect(errorDetailFromText('{"message":"nope"}', 400)).toBe("nope");
  });

  it("stringifies structured detail (FastAPI validation errors)", () => {
    expect(errorDetailFromText('{"detail":[{"loc":["body"],"msg":"required"}]}', 422)).toBe(
      '[{"loc":["body"],"msg":"required"}]'
    );
  });

  it("returns trimmed raw text for non-JSON bodies (HTML error pages)", () => {
    expect(errorDetailFromText("  <html>Bad Gateway</html>\n", 502)).toBe(
      "<html>Bad Gateway</html>"
    );
  });

  it("synthesizes a message for empty bodies", () => {
    expect(errorDetailFromText("", 500)).toBe("Request failed with status 500");
  });
});

describe("request", () => {
  it("parses JSON on success", async () => {
    mockFetch(200, '{"deal_id":"d1"}');
    await expect(request<{ deal_id: string }>("/deals/d1")).resolves.toEqual({ deal_id: "d1" });
  });

  it("resolves undefined for empty bodies (DELETE/204)", async () => {
    mockFetch(204, "");
    await expect(request<void>("/deals/d1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError carrying status and parsed detail", async () => {
    mockFetch(404, '{"detail":"Deal not found"}');
    const err = (await request("/deals/missing").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Deal not found");
  });

  it("sets JSON Content-Type for string bodies", async () => {
    const fn = mockFetch(200, "{}");
    await request("/deals", { method: "POST", body: JSON.stringify({ a: 1 }) });
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("clears the token and fires UNAUTHORIZED_EVENT on 401", async () => {
    localStorage.setItem("vyntic_auth_token", "stale");
    mockFetch(401, '{"detail":"Token revoked"}');
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    try {
      const err = (await request("/deals").catch((e) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
      expect(listener).toHaveBeenCalledOnce();
      expect(localStorage.getItem("vyntic_auth_token")).toBeNull();
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    }
  });
});
