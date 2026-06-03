import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const USE_CASES = [
  {
    title: "Initial screening",
    body:
      "Run the same operating and diligence questions across new opportunities before the pipeline meeting.",
  },
  {
    title: "Diligence preparation",
    body:
      "Collect the source support behind the core underwriting questions without rebuilding the review from scratch.",
  },
  {
    title: "IC memo support",
    body:
      "Turn the document set into cited points of view, tradeoffs, and unresolved issues for decision-makers.",
  },
  {
    title: "Portfolio monitoring",
    body:
      "Reuse structured question sets across existing investments when new materials or updates arrive.",
  },
];

export default function UseCases() {
  return (
    <LandingSection id="use-cases">
      <div className="grid gap-8 sm:gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="max-w-xl">
          <LandingEyebrow>Use Cases</LandingEyebrow>
          <LandingHeading className="mt-6">
            Built for the main points where deal teams lose time.
          </LandingHeading>
          <LandingText className="mt-5">
            The product is most useful when teams need to move quickly without
            letting the reasoning detach from the underlying material.
          </LandingText>
        </div>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {USE_CASES.map((item, index) => (
            <LandingPanel key={item.title} className="flex h-full flex-col gap-5">
              <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
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
          ))}
        </div>
      </div>
    </LandingSection>
  );
}
