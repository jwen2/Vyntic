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
  handler: (match: RegExpMatchArray, body: unknown) => unknown;
}

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
    return Promise.resolve(jsonResponse(route.handler(match, body)));
  }

  return null;
}
