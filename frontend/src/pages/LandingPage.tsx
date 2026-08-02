import LandingNav from "../components/landing/LandingNav";
import HeroSection from "../components/landing/HeroSection";
import PlatformOverview from "../components/landing/PlatformOverview";
import ProductShowcase from "../components/landing/ProductShowcase";
import UseCases from "../components/landing/UseCases";
import SecuritySection from "../components/landing/SecuritySection";
import FinalCTA from "../components/landing/FinalCTA";
import LandingFooter from "../components/landing/LandingFooter";
import LandingDivider from "../components/landing/ui/LandingDivider";

export default function LandingPage() {
  return (
    <div className="landing-ivory landing-shell min-h-screen">
      <LandingNav />
      <main>
        <HeroSection />
        <LandingDivider />
        <PlatformOverview />
        <ProductShowcase />
        <LandingDivider />
        <UseCases />
        <SecuritySection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
