const LOGOS = [
  "Meridian Capital",
  "Apex Partners",
  "Crestview Equity",
  "Ironwood Capital",
  "Ridgeline Partners",
  "Sentinel Growth",
  "Vanguard PE",
  "Northstar Advisory",
];

export default function LogoStrip() {
  return (
    <section className="bg-white border-y border-gray-100 py-12 lg:py-16">
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-sm font-medium text-gray-400 uppercase tracking-wider mb-8">
          Trusted by leading private equity firms
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {LOGOS.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 text-gray-300 hover:text-gray-400 transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-400">
                  {name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-400">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
