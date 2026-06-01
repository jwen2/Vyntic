import LandingNav from "../components/landing/LandingNav";
import HeroSection from "../components/landing/HeroSection";
import LogoStrip from "../components/landing/LogoStrip";
import FeatureCards from "../components/landing/FeatureCards";
import HowItWorks from "../components/landing/HowItWorks";
import Testimonials from "../components/landing/Testimonials";
import PricingSection from "../components/landing/PricingSection";
import FinalCTA from "../components/landing/FinalCTA";
import LandingFooter from "../components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <LogoStrip />
        <FeatureCards />
        <HowItWorks />
        <Testimonials />
        <PricingSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </>
  );
}
