/**
 * The demo fixture router. Maps (method, path) to a canned payload and
 * synthesises a Response, so `fetchWrapper` can hand it back to the app
 * without a network round trip.
 *
 * Returns null on no match rather than throwing or 404-ing, so the caller
 * chooses the failure mode. In dev an unmatched path is a loud console error
 * (see lib/api.ts) — silently returning empty data would let a half-mocked
 * surface look fine in review and break in front of a prospect.
 */
export interface DemoRoute {
  method: string;
  pattern: RegExp;
  /**
   * `match` is against the path with the query string removed, so a route
   * pattern never has to anticipate one. `url` is the request as the app made
   * it, query and all — a handler that varies on a query parameter (history
   * filtered by `?workstream=`) reads it from there. Handlers that don't care
   * simply declare fewer parameters.
   */
  handler: (match: RegExpMatchArray, body: unknown, url: string) => unknown;
}

/**
 * Thrown by a handler for a path the demo deliberately does not serve, to say
 * so in the product's own words.
 *
 * Unmatched paths already fail (`lib/api.ts:76`, 404 "Not available in demo"),
 * so this is not about preventing a write — it is about what the visitor reads
 * when one is refused. That generic string surfaces in the UI as a red
 * `ApiError: Not available in demo` band, which looks like a fault rather than
 * a boundary. A registered refusal carries a sentence explaining why the demo
 * stops here, and travels the app's real error path — `errorDetailFromText`
 * unwraps `detail` into the `ApiError` message every panel already renders, so
 * no component needs a demo branch.
 */
export class DemoRefusal extends Error {}

let routes: DemoRoute[] = [];

export function registerDemoRoutes(next: DemoRoute[]): void {
  routes = routes.concat(next);
}

/** Test-only: drop all registered routes. */
export function resetDemoRoutes(): void {
  routes = [];
}

function jsonResponse(payload: unknown): Response {
  if (payload === undefined) {
    // A body of "" (rather than null) throws here: per the Fetch spec, a
    // null-body status (204 among them) cannot be paired with a non-null
    // body, and an empty string still counts as non-null.
    return new Response(null, { status: 204 });
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function demoFetch(url: string, options: RequestInit = {}): Promise<Response> | null {
  const method = (options.method || "GET").toUpperCase();
  const path = url.split("?")[0];

  for (const route of routes) {
    if (route.method.toUpperCase() !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;

    let body: unknown = undefined;
    if (typeof options.body === "string") {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }
    }
    try {
      return Promise.resolve(jsonResponse(route.handler(match, body, url)));
    } catch (err) {
      if (err instanceof DemoRefusal) {
        // 403, not the unmatched path's 404: this route exists and is answered
        // deliberately. Only the `detail` reaches the visitor.
        return Promise.resolve(
          new Response(JSON.stringify({ detail: err.message }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      throw err;
    }
  }

  return null;
}
