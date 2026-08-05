import { describe, it, expect, beforeEach } from "vitest";
import { DemoRefusal, demoFetch, registerDemoRoutes, resetDemoRoutes } from "./transport";

describe("demoFetch", () => {
  beforeEach(() => {
    resetDemoRoutes();
  });

  it("returns null when no route matches", async () => {
    expect(demoFetch("/api/nope", { method: "GET" })).toBeNull();
  });

  it("matches a registered GET route and returns a JSON Response", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [{ id: "a" }] },
    ]);
    const res = await demoFetch("/api/things", { method: "GET" })!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a" }]);
  });

  it("passes regex capture groups to the handler", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things\/([^/]+)$/, handler: (m) => ({ id: m[1] }) },
    ]);
    const res = await demoFetch("/api/things/xyz", { method: "GET" })!;
    expect(await res.json()).toEqual({ id: "xyz" });
  });

  it("parses a JSON request body and hands it to the handler", async () => {
    registerDemoRoutes([
      { method: "POST", pattern: /^\/api\/echo$/, handler: (_m, body) => body },
    ]);
    const res = await demoFetch("/api/echo", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    })!;
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("treats a missing method as GET", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [] },
    ]);
    expect(demoFetch("/api/things", {})).not.toBeNull();
  });

  it("ignores the query string when matching", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [] },
    ]);
    expect(demoFetch("/api/things?page=2", { method: "GET" })).not.toBeNull();
  });

  it("returns a 204 with an empty body when the handler returns undefined", async () => {
    registerDemoRoutes([
      { method: "DELETE", pattern: /^\/api\/things\/x$/, handler: () => undefined },
    ]);
    const res = await demoFetch("/api/things/x", { method: "DELETE" })!;
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  describe("DemoRefusal", () => {
    it("becomes a 403 whose detail is the message the visitor reads", async () => {
      registerDemoRoutes([
        {
          method: "POST",
          pattern: /^\/api\/things$/,
          handler: () => {
            throw new DemoRefusal("Not wired here, and here is why.");
          },
        },
      ]);

      const res = await demoFetch("/api/things", { method: "POST" })!;
      expect(res.status).toBe(403);
      // 403 rather than the unmatched path's 404: this route exists and is
      // answered deliberately.
      expect(await res.json()).toEqual({ detail: "Not wired here, and here is why." });
    });

    // The catch is deliberately narrow. A genuine bug in a handler must keep
    // surfacing as a bug — swallowing it into a tidy 403 would disguise a
    // broken fixture as an intentional boundary.
    it("lets any other handler error propagate", () => {
      registerDemoRoutes([
        {
          method: "GET",
          pattern: /^\/api\/boom$/,
          handler: () => {
            throw new TypeError("cannot read properties of undefined");
          },
        },
      ]);

      expect(() => demoFetch("/api/boom", { method: "GET" })).toThrow(TypeError);
    });
  });
});
