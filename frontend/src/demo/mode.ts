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

/**
 * Set the flag first, then clear the real token — never the other order.
 * If sessionStorage is unwritable (private-mode Safari, quota) or the write
 * is silently dropped (some privacy-hardened browsers/extensions accept
 * setItem without throwing but don't persist it), the flag never took, so
 * we must not have already deleted a real session on the way there. Returns
 * false on that failure so the caller (DemoGate) can route somewhere that
 * doesn't assume demo mode is active, instead of letting the exception
 * propagate out of a React effect.
 */
export function enableDemoMode(): boolean {
  try {
    sessionStorage.setItem(DEMO_FLAG_KEY, "1");
    if (sessionStorage.getItem(DEMO_FLAG_KEY) !== "1") {
      // Write was accepted but didn't stick — treat like a throw.
      return false;
    }
  } catch {
    return false;
  }

  // A real session must never blend with fixture data. The flag is
  // already set at this point, so even if this throws, isDemoMode() is
  // still true and there is no real token left to blend in on any path
  // that matters; best effort covers the rest.
  try {
    localStorage.removeItem("vyntic_auth_token");
  } catch {
    // ignore — same storage subsystem just succeeded above, so this is
    // vanishingly unlikely, but it must not throw out of the caller.
  }

  return true;
}

export function disableDemoMode(): void {
  try {
    sessionStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    // ignore — nothing destructive here either way.
  }
}
