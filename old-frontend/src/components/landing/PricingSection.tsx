const TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For analysts exploring AI-powered deal analysis.",
    features: [
      "Up to 3 active deals",
      "10 queries per day",
      "PDF & Excel upload",
      "Source citations",
      "CSV export",
    ],
    cta: "Get started for free",
    ctaStyle: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For deal teams running active pipelines.",
    features: [
      "Unlimited deals",
      "Unlimited queries",
      "Priority AI processing",
      "Conversation memory",
      "Synthesis summaries",
      "Question templates",
      "Document viewer",
      "Email support",
    ],
    cta: "Start free trial",
    ctaStyle:
      "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/25",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For firms with compliance, SSO, and scale requirements.",
    features: [
      "Everything in Pro",
      "SSO / SAML authentication",
      "Audit trail & compliance logs",
      "Custom question sets",
      "Dedicated support",
      "On-premise deployment option",
      "API access",
      "SLA guarantee",
    ],
    cta: "Contact sales",
    ctaStyle: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    highlighted: false,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-gray-50 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
            Pricing
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Start free. Upgrade when your pipeline demands it.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative bg-white rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? "border-2 border-blue-600 shadow-xl shadow-blue-600/10 scale-[1.02]"
                  : "border border-gray-200"
              }`}
            >
              {/* Popular badge */}
              {tier.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Tier info */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-gray-500">{tier.period}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {tier.description}
                </p>
              </div>

              {/* Feature list */}
              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <svg
                      className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all ${tier.ctaStyle}`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
