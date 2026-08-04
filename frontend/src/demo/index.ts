/**
 * Single registration entry point for every demo fixture group. Called once
 * by DemoGate before the app renders, and by tests that need the full set.
 *
 * Later tasks add their register*Fixtures() call here.
 */
import { registerUserFixtures } from "./fixtures/user";

let registered = false;

export function registerAllDemoFixtures(): void {
  if (registered) return;
  registered = true;
  registerUserFixtures();
}

/** Test-only: clear the registration guard so a test can re-register fixtures. */
export function __resetRegistration(): void {
  registered = false;
}

export { isDemoMode, enableDemoMode, disableDemoMode, DEMO_TOKEN } from "./mode";
