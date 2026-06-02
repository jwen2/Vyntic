import LandingButton from "./ui/LandingButton";
import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const PROOF_POINTS = [
  "Side-by-side comparison across active deals",
  "Cited outputs tied back to source material",
  "Summaries shaped for IC preparation",
];

export default function HeroSection() {
  return (
    <LandingSection className="overflow-hidden pb-16 pt-16 lg:pb-20 lg:pt-24">
      <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="max-w-3xl">
          <LandingEyebrow>Vyntic Platform</LandingEyebrow>
          <LandingHeading as="h1" size="hero" className="mt-6 max-w-4xl">
            Deal work, compressed into hours.
          </LandingHeading>
          <LandingText className="mt-6 max-w-2xl text-lg">
            Vyntic helps private equity teams ingest CIMs and diligence
            materials, compare opportunities side by side, and produce cited
            outputs for investment committee review.
          </LandingText>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LandingButton href="#contact">Request a demo</LandingButton>
            <LandingButton href="#product" variant="secondary">
              View platform
            </LandingButton>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {PROOF_POINTS.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[var(--landing-border)] bg-white px-4 py-4"
              >
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Workflow
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--landing-text)]">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>

        <LandingPanel className="landing-grid landing-noise overflow-hidden p-0">
          <div className="border-b border-[var(--landing-border)] bg-white px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Comparison Workspace
                </div>
                <div className="mt-1 text-sm font-medium text-[var(--landing-text)]">
                  Pipeline review
                </div>
              </div>
              <div className="rounded-full border border-[var(--landing-border)] px-3 py-1 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                Live documents
              </div>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="rounded-[1.5rem] border border-[var(--landing-border)] bg-white p-4">
              <div className="overflow-x-auto">
                <div className="grid min-w-[640px] grid-cols-[1.3fr_repeat(3,1fr)] gap-px overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-border)] text-xs">
                  {[
                    "Deal",
                    "Growth",
                    "Risk",
                    "Summary",
                    "North Peak",
                    "Expansion driven by enterprise pipeline",
                    "Concentration in top two accounts",
                    "Best top-line momentum in current set",
                    "Harbor Health",
                    "Stable retention, slower new logo motion",
                    "Reimbursement timing exposure",
                    "Defensive profile, less upside",
                  ].map((cell, index) => (
                    <div
                      key={cell + index}
                      className={`p-3 leading-5 ${
                        index < 4
                          ? "bg-[var(--landing-surface-alt)] font-mono-plex uppercase tracking-[0.14em] text-[10px] text-[var(--landing-muted)]"
                          : "bg-white text-[var(--landing-text)]"
                      }`}
                    >
                      {cell}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[1.5rem] border border-[var(--landing-border)] bg-white p-4">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Source Trace
                </div>
                <div className="mt-3 rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-4 text-sm text-[var(--landing-text)]">
                  <div className="font-medium">Customer concentration</div>
                  <div className="mt-2 leading-6 text-[var(--landing-muted)]">
                    “Top two accounts represented 38% of FY25 revenue...”
                  </div>
                  <div className="mt-3 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                    CIM • Page 27
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[var(--landing-border)] bg-[var(--landing-inverse)] p-4 text-white">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
                  IC Summary
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-white/78">
                  <p>
                    North Peak shows the strongest near-term growth profile, but
                    carries concentration exposure that should be resolved before
                    advancing.
                  </p>
                  <p>
                    Harbor Health is lower-volatility and easier to underwrite,
                    though current upside appears more limited.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </LandingPanel>
      </div>
    </LandingSection>
  );
}
