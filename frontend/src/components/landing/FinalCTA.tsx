import LandingButton from "./ui/LandingButton";
import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

export default function FinalCTA() {
  return (
    <LandingSection id="contact" tone="inverse" className="overflow-hidden">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div className="max-w-3xl">
          <LandingEyebrow tone="inverse">Pilot With Us</LandingEyebrow>
          {/* No colour class — inherits --landing-inverse-text from the
              section's inverse tone. */}
          <LandingHeading className="mt-6 font-serif">
            Bring us one diligence workflow.
          </LandingHeading>
          <LandingText tone="inverseMuted" className="mt-5 max-w-2xl">
            We will walk through the product, scope a pilot around one deal
            room or sample pack, and show what cited analysis can produce for
            screening or IC preparation.
          </LandingText>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {/* `secondary` already resolves to the ivory surface on ink, so the
              hand-rolled bg-white/text-black pair is no longer needed. */}
          <LandingButton
            href="mailto:hello@vyntic.com?subject=Vyntic%20pilot"
            variant="secondary"
            size="compact"
            className="w-full sm:w-auto"
          >
            Discuss a pilot
          </LandingButton>
          {/* Overrides kept on the `secondary` base exactly as before — this
              is a stack of competing utilities and the project has no
              tailwind-merge, so changing the base could flip which wins. */}
          <LandingButton
            to="/login"
            variant="secondary"
            size="compact"
            className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
          >
            Sign in to the app
          </LandingButton>
        </div>
      </div>
    </LandingSection>
  );
}
