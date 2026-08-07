import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { enableDemoMode } from "@/demo/mode";
import { registerAllDemoFixtures } from "@/demo";

/**
 * `/demo` is an activation gate, not a page. It flips the demo flag, registers
 * fixtures, then redirects into the normal app routes.
 *
 * Redirecting into the real routes (rather than nesting the demo under
 * /demo/*) means every page component's hardcoded links — /deal/:id and the
 * rest — keep working with no changes. The cost is that the URL no longer
 * says "demo", which the persistent banner compensates for.
 */

/**
 * The entry into the demo is a *document* navigation, not a client-side one.
 * AuthProvider bootstraps once at app mount; on a cold arrival at /demo that
 * happened before the demo flag existed, so it settled on user=null and a
 * client-side navigate("/app") would hand a null user to ProtectedRoute and
 * bounce the visitor to /login. Reloading the document re-runs main.tsx,
 * which registers fixtures and lets AuthProvider bootstrap off DEMO_TOKEN.
 * replace() rather than assign() so Back does not land on /demo and loop.
 */
export type HardNavigate = (url: string) => void;

const replaceDocument: HardNavigate = (url) => window.location.replace(url);

/**
 * Injected with a real default rather than called inline: jsdom implements no
 * navigation, so this is the smallest seam that lets the redirect be asserted
 * in a test. A defaulted prop keeps the only call site (`<DemoGate />` in
 * App.tsx) unchanged and needs no module-mocking machinery.
 */
export default function DemoGate({ hardNavigate = replaceDocument }: { hardNavigate?: HardNavigate }) {
  const navigate = useNavigate();

  useEffect(() => {
    registerAllDemoFixtures();
    // enableDemoMode() can fail if storage is unwritable (private-mode
    // Safari, quota) — it never destroys a real token in that case, but
    // there is also no demo to enter. Land on the marketing page rather
    // than /app, which would just bounce through ProtectedRoute anyway.
    // That path stays client-side: no flag was written, so a document
    // reload would boot into exactly the same state at the cost of a
    // blank round trip.
    if (enableDemoMode()) {
      hardNavigate("/app");
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate, hardNavigate]);

  return null;
}
