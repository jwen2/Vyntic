/**
 * Demo mode is session-scoped: closing the tab ends it, but a refresh or
 * back-button navigation keeps it, so free-roam browsing works normally.
 *
 * The flag is read by the three network chokepoints (lib/api.ts fetchWrapper,
 * lib/sse.ts sseStream, lib/workflows.ts subscribeRun). When it is off, those
 * call sites take a single early-return check and behave exactly as before.
 */
export const DEMO_FLAG_KEY = "vyntic_demo_mode";

/**
 * Synthetic token handed to AuthProvider. It never reaches a server — the
 * transport is mocked — but it must be non-null, because AuthProvider bails
 * out before calling getMe() when getAuthToken() returns null.
 */
export const DEMO_TOKEN = "demo-session";

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    // Private-mode Safari and similar can throw on storage access.
    return false;
  }
}

export function enableDemoMode(): void {
  // A real session must never blend with fixture data.
  localStorage.removeItem("vyntic_auth_token");
  sessionStorage.setItem(DEMO_FLAG_KEY, "1");
}

export function disableDemoMode(): void {
  sessionStorage.removeItem(DEMO_FLAG_KEY);
}
