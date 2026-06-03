import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const PILLARS = [
  {
    index: "01",
    title: "Ingest",
    body:
      "Bring CIMs, financials, and supporting diligence materials into one structured workspace.",
  },
  {
    index: "02",
    title: "Compare",
    body:
      "Run the same question set across multiple opportunities and inspect the answers in one view.",
  },
  {
    index: "03",
    title: "Verify",
    body:
      "Trace claims back to source material with citations and document context before sharing conclusions.",
  },
  {
    index: "04",
    title: "Synthesize",
    body:
      "Turn fragmented findings into summaries and red-flag views aligned to investment committee work.",
  },
];

export default function PlatformOverview() {
  return (
    <LandingSection id="platform" className="pt-6">
      <div className="max-w-3xl">
        <LandingEyebrow>Platform</LandingEyebrow>
        <LandingHeading className="mt-6">
          One system for ingestion, comparison, verification, and synthesis.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          The product is designed around how deal teams actually work: moving
          from raw documents to a defensible point of view without rebuilding
          the workflow for every opportunity.
        </LandingText>
      </div>

      <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PILLARS.map((pillar) => (
          <LandingPanel key={pillar.title} className="flex h-full flex-col gap-6">
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              {pillar.index}
            </div>
            <div>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--landing-muted)]">
                {pillar.body}
              </p>
            </div>
          </LandingPanel>
        ))}
      </div>
    </LandingSection>
  );
}
