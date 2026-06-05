import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingScrollReveal from "./ui/LandingScrollReveal";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const CONTROLS = [
  {
    title: "Deal-level separation",
    body:
      "Keep each opportunity in its own workspace so review stays scoped to the relevant materials.",
  },
  {
    title: "Controlled access",
    body:
      "Limit who can view, update, and operate inside the workspace based on team roles.",
  },
  {
    title: "Traceable outputs",
    body:
      "Preserve the path from answer to source so teams can inspect what supports each conclusion.",
  },
  {
    title: "Human-verifiable citations",
    body:
      "Support fast review by keeping the document context visible rather than hiding it behind generated text.",
  },
];

export default function SecuritySection() {
  return (
    <LandingSection id="security" tone="muted">
      <LandingScrollReveal className="max-w-3xl">
        <LandingEyebrow>Security And Controls</LandingEyebrow>
        <LandingHeading className="mt-6">
          Built for faster analysis without losing control over attribution and review.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          The trust model here is operational: keep workspaces separated, make
          outputs inspectable, and keep the source trail visible throughout the
          workflow.
        </LandingText>
      </LandingScrollReveal>

      <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2">
        {CONTROLS.map((item, index) => (
          <LandingScrollReveal
            key={item.title}
            className="landing-reveal-card"
            variant="card"
            delay={index * 85}
          >
            <LandingPanel className="landing-reveal-card-inner flex h-full flex-col gap-4">
              <div className="landing-reveal-index font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                Control
              </div>
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
                {item.title}
              </h3>
              <p className="text-sm leading-6 text-[var(--landing-muted)]">
                {item.body}
              </p>
            </LandingPanel>
          </LandingScrollReveal>
        ))}
      </div>
    </LandingSection>
  );
}
