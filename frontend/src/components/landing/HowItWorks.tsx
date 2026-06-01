const STEPS = [
  {
    number: "01",
    title: "Upload your data room",
    description:
      "Drag and drop CIMs, financial models, Excel files, and any other deal documents. Vyntic parses everything — tables, charts, text — with full fidelity.",
    detail: "PDF, XLSX, DOCX supported",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Ask your questions",
    description:
      "Use pre-built PE question templates across financials, risk, commercial, and deal thesis — or write your own custom queries.",
    detail: "40+ built-in templates",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
        />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Compare and decide",
    description:
      "Get an AI-generated comparison matrix with cited answers, synthesis summaries, and red flag detection — ready for your investment committee.",
    detail: "Results in under 2 minutes",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="solutions" className="bg-gray-50 py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
            How it works
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
            From data room to IC memo in three steps
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            No setup required. Upload, ask, and get answers immediately.
          </p>
        </div>

        {/* Steps */}
        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12 relative">
          {/* Connecting line (desktop) */}
          <div className="hidden lg:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200" />

          {STEPS.map((step) => (
            <div key={step.number} className="relative text-center">
              {/* Step icon */}
              <div className="relative inline-flex items-center justify-center w-16 h-16 bg-white border-2 border-blue-200 rounded-2xl text-blue-600 mb-6 shadow-sm">
                {step.icon}
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">
                    {step.number}
                  </span>
                </div>
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {step.title}
              </h3>
              <p className="text-gray-500 leading-relaxed mb-4">
                {step.description}
              </p>

              {/* Detail badge */}
              <span className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                {step.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
