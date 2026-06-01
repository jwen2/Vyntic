
import { useState } from "react";

export default function FinalCTA() {
  const [email, setEmail] = useState("");

  return (
    <section className="relative bg-[#0A0F1E] py-20 lg:py-28 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
          Ready to transform your deal analysis?
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Join the PE firms using Vyntic to screen deals faster, prepare for IC
          meetings in minutes, and never miss a red flag again.
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

        <p className="mt-5 text-sm text-gray-500">
          Free forever for up to 3 deals. No credit card required.
        </p>
      </div>
    </section>
  );
}
