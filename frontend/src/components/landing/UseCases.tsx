import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingScrollReveal from "./ui/LandingScrollReveal";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const USE_CASES = [
  {
    title: "Screen one new CIM",
    body:
      "Turn a fresh CIM and supporting materials into a cited matrix before the first internal readout.",
  },
  {
    title: "Pressure-test a QoE pack",
    body:
      "Extract adjustments, working capital notes, revenue quality, and open questions with links back to source pages.",
  },
  {
    title: "Prepare for IC",
    body:
      "Convert document findings into a source-backed view of thesis support, risks, and unresolved diligence items.",
  },
  {
    title: "Reuse a question set",
    body:
      "Test whether recurring prompts can become reusable templates across deals, updates, or portfolio reviews.",
  },
];

export default function UseCases() {
  return (
    <LandingSection id="use-cases">
      <div className="grid gap-8 sm:gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <LandingScrollReveal className="max-w-xl">
          <LandingEyebrow>Pilot Use Cases</LandingEyebrow>
          <LandingHeading className="mt-6">
            Start with one workflow where analyst time is easy to measure.
          </LandingHeading>
          <LandingText className="mt-5">
            The best pilots are narrow: one deal room, a known review pattern,
            and a concrete output your team already produces.
          </LandingText>
        </LandingScrollReveal>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {USE_CASES.map((item, index) => (
            <LandingScrollReveal
              key={item.title}
              className="landing-reveal-card"
              variant="card"
              delay={index * 90}
            >
              <LandingPanel className="landing-reveal-card-inner flex h-full flex-col gap-5">
                <div className="landing-reveal-index font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  0{index + 1}
                </div>
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--landing-muted)]">
                    {item.body}
                  </p>
                </div>
              </LandingPanel>
            </LandingScrollReveal>
          ))}
        </div>
      </div>
    </LandingSection>
  );
}
