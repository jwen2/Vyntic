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
          <LandingEyebrow className="text-white/55">Request A Demo</LandingEyebrow>
          <LandingHeading className="mt-6 text-white">
            See how Vyntic fits into your deal process.
          </LandingHeading>
          <LandingText tone="inverseMuted" className="mt-5 max-w-2xl">
            We’ll walk through the platform, your review workflow, and where
            cited analysis can shorten screening and IC preparation.
          </LandingText>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <LandingButton
            href="mailto:hello@vyntic.com?subject=Request%20a%20Vyntic%20demo"
            className="w-full bg-white text-black hover:bg-white/90 sm:w-auto"
          >
            Request a demo
          </LandingButton>
          <LandingButton
            to="/login"
            variant="secondary"
            className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
          >
            Sign in to the app
          </LandingButton>
        </div>
      </div>
    </LandingSection>
  );
}
