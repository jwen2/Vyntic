import LandingEyebrow from "./ui/LandingEyebrow";
import LandingHeading from "./ui/LandingHeading";
import LandingPanel from "./ui/LandingPanel";
import LandingScrollReveal from "./ui/LandingScrollReveal";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const SHOWCASES = [
  {
    label: "Step 01",
    title: "Upload the diligence pack.",
    body:
      "Bring the materials analysts already review: CIMs, QoE reports, legal summaries, operating updates, and Excel files. The pilot starts with the documents your team actually uses.",
    visual: <MatrixMock />,
  },
  {
    label: "Step 02",
    title: "Run the same diligence questions across the set.",
    body:
      "Vyntic returns a matrix of cited answers so an associate can compare findings, spot missing support, and open the source behind any answer.",
    visual: <CitationMock />,
  },
  {
    label: "Step 03",
    title: "Turn findings into a committee-ready view.",
    body:
      "The pilot output should be practical: an IC-style summary, unresolved diligence questions, red flags, and the source trail behind the recommendation.",
    visual: <SummaryMock />,
  },
];

export default function ProductShowcase() {
  return (
    <LandingSection id="product" tone="muted">
      <LandingScrollReveal className="max-w-3xl">
        <LandingEyebrow>Workflow</LandingEyebrow>
        <LandingHeading className="mt-6 font-serif">
          What the pilot looks like inside the product.
        </LandingHeading>
        <LandingText className="mt-5 max-w-2xl">
          The goal is to prove whether Vyntic can shorten one real review loop:
          document intake, question execution, citation review, and synthesis.
        </LandingText>
      </LandingScrollReveal>

      <div className="mt-10 space-y-5 sm:mt-12 sm:space-y-6">
        {SHOWCASES.map((item, index) => (
          <div
            key={item.label}
            className={`grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:items-center ${
              index % 2 === 1 ? "lg:grid-cols-[1.12fr_0.88fr]" : ""
            }`}
          >
            <LandingScrollReveal
              className={index % 2 === 1 ? "lg:order-2" : ""}
              direction={index % 2 === 1 ? "left" : "right"}
              variant="soft"
              delay={index * 40}
            >
              {item.visual}
            </LandingScrollReveal>
            <LandingScrollReveal
              className={index % 2 === 1 ? "lg:order-1" : ""}
              delay={120 + index * 40}
            >
              <LandingPanel radius="card">
                <LandingEyebrow>{item.label}</LandingEyebrow>
                <LandingHeading size="card" className="mt-5">
                  {item.title}
                </LandingHeading>
                <LandingText className="mt-4">{item.body}</LandingText>
              </LandingPanel>
            </LandingScrollReveal>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

function MatrixMock() {
  const headers = ["Document", "Type", "Pages", "Status"];
  const rows = [
    ["CIM", "PDF", "84", "Indexed"],
    ["QoE report", "PDF", "142", "Indexed"],
    ["Operating model", "XLSX", "18 tabs", "Indexed"],
  ];

  return (
    <LandingPanel radius="card" className="h-full p-3 sm:p-4">
      <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
        Uploaded diligence pack
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-0 grid-cols-[1.1fr_0.7fr_0.75fr_0.9fr] gap-px overflow-hidden rounded-lg border border-[var(--landing-border)] bg-[var(--landing-border)] text-[11px] sm:min-w-[620px] sm:grid-cols-4 sm:text-xs">
          {headers.map((header) => (
            <div
              key={header}
              className="bg-[var(--landing-surface-alt)] px-3 py-3 font-mono-plex text-[10px] uppercase tracking-[0.14em] text-[var(--landing-muted)] sm:px-4"
            >
              {header}
            </div>
          ))}
          {rows.flatMap((row) =>
            row.map((cell) => (
              <div
                key={row[0] + cell}
                className="bg-white px-3 py-3 leading-5 text-[var(--landing-text)] sm:px-4"
              >
                {cell}
              </div>
            ))
          )}
        </div>
      </div>
    </LandingPanel>
  );
}

function CitationMock() {
  return (
    <LandingPanel radius="card" className="h-full p-3 sm:p-4">
      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-lg border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-3 sm:p-4">
          <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
            Matrix answer
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--landing-text)]">
            FY26 growth depends on enterprise upsell and channel expansion, but
            the customer base remains concentrated.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-[var(--landing-border)] px-3 py-1 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
            Citation linked
          </div>
        </div>

        <div className="rounded-lg border border-[var(--landing-border)] bg-white p-3 sm:p-4">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              Source context
            </div>
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              QoE · Page 31
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-3 text-sm leading-6 text-[var(--landing-muted)] sm:p-4">
            The company's top two accounts represented 38% of FY25 revenue. The
            next phase of growth assumes broader enterprise adoption within the
            existing customer base.
          </div>
        </div>
      </div>
    </LandingPanel>
  );
}

function SummaryMock() {
  return (
    <LandingPanel variant="inverse" radius="card" className="h-full p-3 sm:p-4">
      <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
        Pilot output
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 sm:p-4">
          <div className="text-sm font-medium text-white">Current read</div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
            <li>Growth case is attractive but depends on concentration diligence.</li>
            <li>Margin bridge needs source-backed validation against the model.</li>
            <li>Open questions are ready for management follow-up.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:p-4">
          <div className="text-sm font-medium text-white">Open items</div>
          <div className="mt-4 space-y-2 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
            <div className="rounded-full border border-white/10 px-3 py-2">
              Revenue concentration
            </div>
            <div className="rounded-full border border-white/10 px-3 py-2">
              EBITDA bridge
            </div>
            <div className="rounded-full border border-white/10 px-3 py-2">
              Legal open items
            </div>
          </div>
        </div>
      </div>
    </LandingPanel>
  );
}
