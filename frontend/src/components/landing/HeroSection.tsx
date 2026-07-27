import LandingButton from "./ui/LandingButton";
import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const PROOF_POINTS = [
  "Pilot on one live or sample deal room",
  "Run cited diligence questions across PDFs and Excel",
  "Shape the workflow directly with the product team",
];

export default function HeroSection() {
  return (
    <LandingSection className="overflow-hidden pb-12 pt-12 sm:pb-14 sm:pt-14 lg:pb-20 lg:pt-24">
      <div className="grid min-w-0 gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14">
        <div className="min-w-0 max-w-3xl">
          <LandingEyebrow>Pilot Program</LandingEyebrow>
          <LandingHeading as="h1" size="hero" className="mt-6 max-w-4xl">
            Pilot an AI diligence workspace on one deal room.
          </LandingHeading>
          <LandingText className="mt-5 max-w-2xl text-base sm:text-lg">
            Vyntic helps private equity teams turn CIMs, QoE reports, models,
            and diligence materials into cited matrices and IC-ready summaries.
            We are onboarding pilot teams now to shape the workflow around real
            deal review.
          </LandingText>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <LandingButton href="#contact" className="w-full sm:w-auto">
              Pilot one deal
            </LandingButton>
            <LandingButton href="#product" variant="secondary" className="w-full sm:w-auto">
              View workflow
            </LandingButton>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {PROOF_POINTS.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[var(--landing-border)] bg-white px-4 py-4"
              >
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Pilot
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--landing-text)]">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>

        <LandingPanel className="landing-grid landing-noise overflow-hidden p-0">
          <div className="border-b border-[var(--landing-border)] bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div>
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Pilot Workspace
                </div>
                <div className="mt-1 text-sm font-medium text-[var(--landing-text)]">
                  Diligence review
                </div>
              </div>
              <div className="rounded-full border border-[var(--landing-border)] px-3 py-1 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                Cited outputs
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">
            <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-white p-3 sm:rounded-[1.5rem] sm:p-4">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[1.05fr_1.15fr_0.9fr_1.1fr] gap-px overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-border)] text-[11px] sm:text-xs">
                  {[
                    "Deal",
                    "Revenue quality",
                    "Risk",
                    "IC note",
                    "Brightwater IV",
                    "Enterprise upsell supports FY26",
                    "Top customers concentrated",
                    "Advance after retention checks",
                    "Glenmoor III",
                    "Stable renewal base, slower new logos",
                    "Vendor savings drive margin",
                    "Cleaner downside, less upside",
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
              <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-white p-3 sm:rounded-[1.5rem] sm:p-4">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Source Trace
                </div>
                <div className="mt-3 rounded-[1.25rem] border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-3 text-sm text-[var(--landing-text)] sm:rounded-2xl sm:p-4">
                  <div className="font-medium">Customer concentration</div>
                  <div className="mt-2 leading-6 text-[var(--landing-muted)]">
                    "Top two accounts represented 38% of FY25 revenue..."
                  </div>
                  <div className="mt-3 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                    CIM • Page 27
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-[var(--landing-inverse)] p-3 text-white sm:rounded-[1.5rem] sm:p-4">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
                  IC Summary
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-white/78">
                  <p>
                    Brightwater shows the strongest near-term growth profile, but
                    carries concentration exposure that should be resolved before
                    advancing.
                  </p>
                  <p>
                    Glenmoor is lower-volatility and easier to underwrite,
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
