const TESTIMONIALS = [
  {
    quote:
      "Vyntic cut our deal screening time from three days to a few hours. We run every new CIM through it before our Monday pipeline meeting.",
    name: "Sarah Chen",
    title: "Vice President",
    firm: "Meridian Capital Partners",
    avatar: "SC",
  },
  {
    quote:
      "The citation feature is what sold us. Every answer maps back to the exact page in the CIM. Our IC trusts the output because they can verify it instantly.",
    name: "Michael Torres",
    title: "Principal",
    firm: "Apex Growth Equity",
    avatar: "MT",
  },
  {
    quote:
      "We used to spend weeks building comparison decks manually. Now we upload docs, pick our questions, and have an IC-ready matrix in minutes.",
    name: "Jessica Park",
    title: "Associate Director",
    firm: "Crestview Partners",
    avatar: "JP",
  },
];

export default function Testimonials() {
  return (
    <section id="customers" className="bg-white py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
            Customers
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
            Trusted by deal teams everywhere
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            See how PE firms are using Vyntic to accelerate their deal process.
          </p>
        </div>

        {/* Testimonial cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="relative bg-gray-50 border border-gray-100 rounded-2xl p-8 hover:shadow-md transition-shadow"
            >
              {/* Quote mark */}
              <svg
                className="w-8 h-8 text-blue-200 mb-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Z" />
              </svg>

              <p className="text-gray-700 leading-relaxed mb-6">{t.quote}</p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {t.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t.title}, {t.firm}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
