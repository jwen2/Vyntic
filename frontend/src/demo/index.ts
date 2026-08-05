/**
 * Single registration entry point for every demo fixture group. Called once
 * by DemoGate before the app renders, and by tests that need the full set.
 *
 * Later tasks add their register*Fixtures() call here.
 */
import { registerUserFixtures } from "./fixtures/user";
import { registerEntityFixtures } from "./fixtures/entities";
import { registerWorkflowFixtures } from "./fixtures/workflows";
// `fixtures/mutations` deliberately does not import `fixtures/chat`: the chat
// prose stays behind the dynamic import in `lib/sse.ts`, and a static import
// from here would pull it back into the entry chunk.
import { registerMutationFixtures } from "./fixtures/mutations";

let registered = false;

export function registerAllDemoFixtures(): void {
  if (registered) return;
  registered = true;
  registerUserFixtures();
  registerEntityFixtures();
  registerWorkflowFixtures();
  registerMutationFixtures();
}

/** Test-only: clear the registration guard so a test can re-register fixtures. */
export function __resetRegistration(): void {
  registered = false;
}

export { isDemoMode, enableDemoMode, disableDemoMode, DEMO_TOKEN } from "./mode";
