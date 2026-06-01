
import { useState } from "react";

export default function HeroSection() {
  const [email, setEmail] = useState("");

  return (
    <section
      id="hero"
      className="relative bg-[#0A0F1E] pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden"
    >
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-full mb-8">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-blue-300 font-medium">
              Now powered by Gemini 3 Flash
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight">
            AI-Powered Deal Intelligence.{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Decisions in Minutes.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg sm:text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Upload your CIMs, financials, and data rooms. Vyntic&apos;s AI
            analyzes every deal side-by-side so your IC gets answers faster.
          </p>

          {/* Email CTA */}
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="What's your email?"
              className="w-full sm:flex-1 px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <button className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/25 whitespace-nowrap">
              Get started for free
            </button>
          </div>

          {/* Social proof */}
          <p className="mt-6 text-sm text-gray-500">
            No credit card required. Free for up to 3 deals.
          </p>
        </div>

        {/* Hero product mockup */}
        <div className="mt-16 lg:mt-20 relative">
          <div className="relative mx-auto max-w-5xl">
            {/* Browser chrome */}
            <div className="bg-[#141927] rounded-t-xl border border-white/10 border-b-0 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-white/5 rounded-md px-3 py-1 text-xs text-gray-500 max-w-xs mx-auto text-center">
                  app.vyntic.com
                </div>
              </div>
            </div>

            {/* App screenshot mockup */}
            <div className="bg-[#0f1420] border border-white/10 border-t-0 rounded-b-xl overflow-hidden">
              <div className="p-6">
                {/* Mock header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-blue-600 rounded-md" />
                    <div>
                      <div className="h-3 w-16 bg-white/20 rounded" />
                      <div className="h-2 w-24 bg-white/10 rounded mt-1.5" />
                    </div>
                  </div>
                  <div className="h-8 w-24 bg-blue-600/30 rounded-md" />
                </div>

                {/* Mock matrix */}
                <div className="grid grid-cols-4 gap-px bg-white/5 rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="bg-[#1a1f33] p-3 text-xs text-gray-400 font-medium">
                    Deal
                  </div>
                  <div className="bg-[#1a1f33] p-3 text-xs text-blue-400 font-medium">
                    Revenue Growth
                  </div>
                  <div className="bg-[#1a1f33] p-3 text-xs text-blue-400 font-medium">
                    EBITDA Margin
                  </div>
                  <div className="bg-[#1a1f33] p-3 text-xs text-blue-400 font-medium">
                    Key Risks
                  </div>

                  {/* Row 1 */}
                  <div className="bg-[#141927] p-3">
                    <div className="text-xs text-white font-medium">
                      Acme Cloud
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      SaaS ERP
                    </div>
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    <span className="text-emerald-400">+32%</span> YoY driven
                    by enterprise...
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    <span className="text-emerald-400">28.5%</span> with
                    expansion to...
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    Customer concentration risk...
                  </div>

                  {/* Row 2 */}
                  <div className="bg-[#0f1420] p-3">
                    <div className="text-xs text-white font-medium">
                      Pinnacle Health
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Healthcare
                    </div>
                  </div>
                  <div className="bg-[#0f1420] p-3 text-xs text-gray-300">
                    <span className="text-yellow-400">+12%</span> organic growth
                    from...
                  </div>
                  <div className="bg-[#0f1420] p-3 text-xs text-gray-300">
                    <span className="text-emerald-400">35.2%</span> above
                    industry avg...
                  </div>
                  <div className="bg-[#0f1420] p-3 text-xs text-gray-300">
                    Regulatory changes in...
                  </div>

                  {/* Row 3 */}
                  <div className="bg-[#141927] p-3">
                    <div className="text-xs text-white font-medium">
                      Summit Mfg
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Industrials
                    </div>
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    <span className="text-red-400">+5%</span> with defense
                    contract...
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    <span className="text-yellow-400">18.1%</span> compressed
                    by raw...
                  </div>
                  <div className="bg-[#141927] p-3 text-xs text-gray-300">
                    Supply chain dependency...
                  </div>

                  {/* Synthesis row */}
                  <div className="bg-blue-600/10 p-3 col-span-4 border-t border-blue-500/20">
                    <div className="text-xs text-blue-400 font-medium mb-1">
                      Synthesis
                    </div>
                    <div className="text-xs text-gray-400">
                      Acme Cloud shows strongest growth trajectory at 32% YoY.
                      Pinnacle offers highest margins at 35.2%. Summit carries
                      most operational risk due to supply chain...
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-t from-blue-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />
          </div>
        </div>

        {/* Social proof metrics */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-3xl mx-auto">
          {[
            { value: "10x", label: "Faster deal screening" },
            { value: "500+", label: "Documents analyzed" },
            { value: "99%", label: "Citation accuracy" },
            { value: "<2min", label: "Average query time" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl lg:text-3xl font-bold text-white">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
