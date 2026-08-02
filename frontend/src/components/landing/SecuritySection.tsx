import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingScrollReveal from "./ui/LandingScrollReveal";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const CONTROLS = [
  {
    title: "Scoped workspace",
    body:
      "Run the pilot in a single deal workspace so analysis stays bounded to the documents you provide.",
  },
  {
    title: "Role-based access",
    body:
      "Limit who can upload, edit, and review outputs during the pilot.",
  },
  {
    title: "Source-backed review",
    body:
      "Keep every answer tied to citations and source context so the team can challenge the output.",
  },
  {
    title: "Security review ready",
    body:
      "We can work through data-handling, deployment, and access requirements before any live pilot.",
  },
];

export default function SecuritySection() {
  return (
    <LandingSection id="security" tone="muted">
      <LandingScrollReveal className="max-w-3xl">
        <LandingEyebrow>Pilot Controls</LandingEyebrow>
        <LandingHeading className="mt-6 font-serif">
          Keep the pilot narrow, reviewable, and source-backed.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          We are building toward enterprise readiness, but the first evaluation
          should be simple: bounded data, clear access, cited outputs, and a
          security conversation before live materials are used.
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
            <LandingPanel
              radius="card"
              className="landing-reveal-card-inner flex h-full flex-col gap-4"
            >
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
