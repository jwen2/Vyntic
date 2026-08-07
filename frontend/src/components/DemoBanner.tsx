import { disableDemoMode, isDemoMode } from "@/demo/mode";
import Button from "@/components/ui/Button";

/**
 * Persistent demo label.
 *
 * `/demo` redirects into the real app routes (see DemoGate), so the URL reads
 * `/app` and never says "demo". This banner is the only signal a visitor has
 * that the workspace is a demo, and the only place the fictional-manager
 * disclosure appears — which is why it sits above the router rather than on
 * any one page.
 *
 * The flag lives in sessionStorage and is not reactive, so this reads it at
 * render. That is enough: entering is a document navigation (the app remounts
 * with the flag already set) and leaving is one too, below.
 */
export type HardNavigate = (url: string) => void;

const replaceDocument: HardNavigate = (url) => window.location.replace(url);

/**
 * Leaving reloads rather than navigating client-side, mirroring how DemoGate
 * enters. A client-side exit would leave the demo's fixtures registered and
 * AuthProvider still holding the demo session while the flag reads "live" —
 * requests would keep being answered from fixtures on what looks like the real
 * app. The reload tears all of it down.
 *
 * `hardNavigate` is injected with a real default for the same reason DemoGate
 * does it: jsdom implements no navigation, and this is the smallest seam that
 * lets the behaviour be asserted.
 */
export default function DemoBanner({
  hardNavigate = replaceDocument,
}: { hardNavigate?: HardNavigate } = {}) {
  if (!isDemoMode()) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-edge px-3 py-1.5 text-t2"
      style={{ background: "var(--accent-tint)", font: "var(--text-sm)" }}
    >
      {/* Kept to one short sentence: it wraps to three lines on a phone, where
          it is competing with the workspace for a 780px viewport. Both
          disclosures a visitor needs — sample data, fictional manager — survive
          the trim; "every figure is illustrative" did not, being a restatement
          of "sample data". */}
      <span>
        <strong className="text-t1">Demo — sample data.</strong> Brightwater Capital
        Partners is a fictional manager.
      </span>
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          // Order matters: the flag has to be gone before the document
          // reloads, or the reloaded app boots straight back into the demo.
          disableDemoMode();
          hardNavigate("/");
        }}
      >
        Exit demo
      </Button>
    </div>
  );
}
