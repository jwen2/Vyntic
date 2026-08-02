import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingScrollReveal from "./ui/LandingScrollReveal";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const PILLARS = [
  {
    index: "01",
    title: "Bring one deal room",
    body:
      "Use a live opportunity, a recently closed deal, or a representative sample pack to test the workflow.",
  },
  {
    index: "02",
    title: "Configure diligence questions",
    body:
      "Start from PE-shaped question sets, then adapt prompts to your team, mandate, and IC process.",
  },
  {
    index: "03",
    title: "Review cited outputs",
    body:
      "Inspect answer matrices, citations, source snippets, and open questions before anything leaves the workspace.",
  },
  {
    index: "04",
    title: "Decide what sticks",
    body:
      "Use the pilot to identify which diligence workflows save time and should become repeatable templates.",
  },
];

export default function PlatformOverview() {
  return (
    <LandingSection id="platform" className="pt-6">
      <LandingScrollReveal className="max-w-3xl">
        <LandingEyebrow>Pilot Structure</LandingEyebrow>
        <LandingHeading className="mt-6 font-serif">
          A focused pilot around one real diligence workflow.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          We are not asking teams to rip out their process. The pilot is scoped
          to one deal room, one set of recurring questions, and one concrete
          output that your team can evaluate.
        </LandingText>
      </LandingScrollReveal>

      <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PILLARS.map((pillar, index) => (
          <LandingScrollReveal
            key={pillar.title}
            className="landing-reveal-card"
            variant="card"
            delay={index * 80}
          >
            <LandingPanel
              radius="card"
              className="landing-reveal-card-inner flex h-full flex-col gap-6"
            >
              <div className="landing-reveal-index font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
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
          </LandingScrollReveal>
        ))}
      </div>
    </LandingSection>
  );
}
