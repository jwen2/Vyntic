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
export default function DemoGate() {
  const navigate = useNavigate();

  useEffect(() => {
    registerAllDemoFixtures();
    enableDemoMode();
    navigate("/app", { replace: true });
  }, [navigate]);

  return null;
}
