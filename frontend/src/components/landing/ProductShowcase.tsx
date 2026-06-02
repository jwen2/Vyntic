import LandingButton from "./ui/LandingButton";
import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const SHOWCASES = [
  {
    label: "Comparison Matrix",
    title: "Ask one question across the full pipeline.",
    body:
      "Vyntic organizes answers in a matrix so teams can compare operating performance, risks, and thesis support without stitching together slides by hand.",
    visual: <MatrixMock />,
  },
  {
    label: "Cited Review",
    title: "Keep every answer reviewable.",
    body:
      "Outputs stay linked to the underlying document context, so an associate or principal can move from answer to source without leaving the workflow.",
    visual: <CitationMock />,
  },
  {
    label: "Investment Summary",
    title: "Produce summaries shaped for committee work.",
    body:
      "When comparisons resolve into a point of view, the platform surfaces the underlying support, unresolved issues, and the core tradeoffs to carry forward.",
    visual: <SummaryMock />,
  },
];

export default function ProductShowcase() {
  return (
    <LandingSection id="product" tone="muted">
      <div className="max-w-3xl">
        <LandingEyebrow>Product</LandingEyebrow>
        <LandingHeading className="mt-6">
          The product surfaces are built around the actual review loop.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          Compare, inspect, and summarize in one flow rather than moving across
          disconnected tools.
        </LandingText>
      </div>

      <div className="mt-12 space-y-6">
        {SHOWCASES.map((item, index) => (
          <div
            key={item.label}
            className={`grid gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:items-center ${
              index % 2 === 1 ? "lg:grid-cols-[1.12fr_0.88fr]" : ""
            }`}
          >
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              {item.visual}
            </div>
            <LandingPanel className={index % 2 === 1 ? "lg:order-1" : ""}>
              <LandingEyebrow>{item.label}</LandingEyebrow>
              <LandingHeading size="card" className="mt-5">
                {item.title}
              </LandingHeading>
              <LandingText className="mt-4">{item.body}</LandingText>
              <div className="mt-8">
                <LandingButton href="#contact" variant="secondary">
                  Request a walkthrough
                </LandingButton>
              </div>
            </LandingPanel>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

function MatrixMock() {
  const headers = ["Deal", "Growth", "Margin", "Key issue"];
  const rows = [
    ["North Peak", "Enterprise pipeline inflecting", "Improving with mix shift", "Customer concentration"],
    ["Harbor Health", "Stable, less aggressive", "High retention quality", "Payer timing"],
    ["Summit Works", "Project-led variability", "Compressed by input costs", "Cyclicality"],
  ];

  return (
    <LandingPanel className="h-full p-4">
      <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
        Shared question set
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[620px] grid-cols-4 gap-px overflow-hidden rounded-[1.5rem] border border-[var(--landing-border)] bg-[var(--landing-border)] text-xs">
          {headers.map((header) => (
            <div
              key={header}
              className="bg-[var(--landing-surface-alt)] px-4 py-3 font-mono-plex text-[10px] uppercase tracking-[0.14em] text-[var(--landing-muted)]"
            >
              {header}
            </div>
          ))}
          {rows.flatMap((row) =>
            row.map((cell) => (
              <div key={row[0] + cell} className="bg-white px-4 py-3 leading-5 text-[var(--landing-text)]">
                {cell}
              </div>
            ))
          )}
        </div>
      </div>
    </LandingPanel>
  );
}

function CitationMock() {
  return (
    <LandingPanel className="h-full p-4">
      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-[1.5rem] border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-4">
          <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
            Answer
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--landing-text)]">
            Management expects 22% growth from enterprise upsell and channel
            expansion, though the customer base remains concentrated.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-[var(--landing-border)] px-3 py-1 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
            Citation linked
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[var(--landing-border)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              Source context
            </div>
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              CIM · Page 27
            </div>
          </div>
          <div className="mt-4 rounded-[1.25rem] border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-4 text-sm leading-6 text-[var(--landing-muted)]">
            The company’s top two accounts represented 38% of FY25 revenue. The
            next phase of growth assumes broader enterprise adoption within the
            existing customer base.
          </div>
        </div>
      </div>
    </LandingPanel>
  );
}

function SummaryMock() {
  return (
    <LandingPanel variant="inverse" className="h-full p-4">
      <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
        Memo-ready synthesis
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium text-white">Current read</div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
            <li>North Peak leads on growth but requires concentration diligence.</li>
            <li>Harbor Health is cleaner to underwrite with lower upside.</li>
            <li>Summit Works is more cyclical than the current mandate favors.</li>
          </ul>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-medium text-white">Open items</div>
          <div className="mt-4 space-y-2 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
            <div className="rounded-full border border-white/10 px-3 py-2">
              Customer concentration
            </div>
            <div className="rounded-full border border-white/10 px-3 py-2">
              Payer timing
            </div>
            <div className="rounded-full border border-white/10 px-3 py-2">
              Cost volatility
            </div>
          </div>
        </div>
      </div>
    </LandingPanel>
  );
}
