import LandingButton from "./ui/LandingButton";
import LandingHeading from "./ui/LandingHeading";
import LandingInput from "./ui/LandingInput";
import LandingPanel from "./ui/LandingPanel";
import LandingSection from "./ui/LandingSection";
import LandingText from "./ui/LandingText";

const PREVIEW_COLUMNS = ["Deal", "Revenue quality", "Risk", "IC note"];

const PREVIEW_ROWS = [
  {
    deal: "Brightwater IV",
    cells: [
      { text: "Brightwater IV" },
      { text: "Enterprise upsell supports FY26", cite: "S1" },
      { text: "Top customers concentrated", cite: "S2" },
      { text: "Advance after retention checks" },
    ],
  },
  {
    deal: "Glenmoor III",
    cells: [
      { text: "Glenmoor III" },
      { text: "Stable renewal base, slower new logos", cite: "S1" },
      { text: "Vendor savings drive margin", cite: "S3" },
      { text: "Cleaner downside, less upside" },
    ],
  },
];

export default function HeroSection() {
  return (
    <LandingSection className="overflow-hidden pb-12 pt-12 sm:pb-14 sm:pt-14 lg:pb-20 lg:pt-24">
      <div className="mx-auto min-w-0 max-w-5xl text-center">
        <span className="inline-flex items-center gap-[7px] rounded-full border border-[var(--landing-border)] bg-[var(--landing-accent-soft)] px-[13px] py-[5px] text-[11.5px] font-semibold text-[var(--landing-accent)]">
          <span
            className="inline-block h-[6px] w-[6px] rounded-full"
            style={{ background: "var(--landing-accent)" }}
          />
          Pilot Program
        </span>
        <LandingHeading as="h1" size="hero" className="mx-auto mt-6 max-w-4xl font-serif">
          Pilot an AI diligence workspace{" "}
          <span style={{ color: "var(--landing-accent)" }}>on one deal room.</span>
        </LandingHeading>
        <LandingText className="mx-auto mt-5 max-w-2xl text-base sm:text-lg">
          Vyntic helps private equity teams turn CIMs, QoE reports, models,
          and diligence materials into cited matrices and IC-ready summaries.
          We are onboarding pilot teams now to shape the workflow around real
          deal review.
        </LandingText>

        {/* Email capture is presentational for now — submit is a no-op until
            the pilot signup endpoint exists. */}
        <form
          className="mx-auto mt-8 flex w-full max-w-[440px] items-stretch gap-[10px]"
          onSubmit={(event) => event.preventDefault()}
        >
          <LandingInput
            type="email"
            inputSize="field"
            aria-label="Email address"
            placeholder="What's your email?"
            className="min-w-0 flex-1"
          />
          <LandingButton
            type="submit"
            variant="ink"
            size="field"
            className="whitespace-nowrap"
          >
            Get started
          </LandingButton>
        </form>

        <LandingPanel className="landing-grid landing-noise mx-auto mt-10 max-w-5xl overflow-hidden p-0 text-left">
          <div className="border-b border-[var(--landing-border)] bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div>
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Pilot Workspace
                </div>
                <div className="mt-1 text-sm font-medium text-[var(--landing-text)]">
                  Diligence review
                </div>
              </div>
              <div className="rounded-full border border-[var(--landing-border)] px-3 py-1 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                Cited outputs
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">
            <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-white p-3 sm:rounded-[1.5rem] sm:p-4">
              <div className="overflow-x-auto">
                {/* Chrome mirrors components/ui/grid-table.css by copy, not import:
                    11px mono-400 headers at 7px 12px 7px 9px, 13px body cells at
                    8px 10px with h-[38px] acting as a row-height floor (cells wrap
                    taller when content is long), zebra striping, and a pinned first
                    column with its border and depth shadow. Keep in sync by hand —
                    see the note in grid-table.css. */}
                <table
                  aria-label="Diligence preview"
                  className="w-full border-collapse text-left text-[13px]"
                >
                  <thead>
                    <tr>
                      {PREVIEW_COLUMNS.map((label, index) => (
                        <th
                          key={label}
                          scope="col"
                          className={`font-mono text-[11px] font-normal align-top text-[var(--landing-muted)] border-b border-[var(--landing-border)] bg-[var(--landing-grid-header)] ${
                            index === 0
                              ? "border-r border-[var(--landing-border)]"
                              : ""
                          }`}
                          style={{
                            padding: "7px 12px 7px 9px",
                            ...(index === 0
                              ? { boxShadow: "8px 0 16px -12px rgba(0, 0, 0, 0.18)" }
                              : {}),
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_ROWS.map((row, rowIndex) => (
                      <tr
                        key={row.deal}
                        style={{
                          background:
                            rowIndex % 2 === 1
                              ? "var(--landing-surface-alt)"
                              : "var(--landing-surface)",
                        }}
                      >
                        {row.cells.map((cell, cellIndex) => (
                          <td
                            key={cell.text}
                            className={`h-[38px] align-middle border-b border-[var(--landing-border)] text-[var(--landing-text)] ${
                              cellIndex === 0
                                ? "border-r border-[var(--landing-border)] font-medium"
                                : ""
                            }`}
                            style={{
                              padding: "8px 10px",
                              ...(cellIndex === 0
                                ? { boxShadow: "8px 0 16px -12px rgba(0, 0, 0, 0.18)" }
                                : {}),
                            }}
                          >
                            <span>{cell.text}</span>
                            {cell.cite ? (
                              <span
                                className="font-mono ml-1 align-middle"
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "var(--landing-accent)",
                                }}
                              >
                                [{cell.cite}]
                              </span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-white p-3 sm:rounded-[1.5rem] sm:p-4">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                  Source Trace
                </div>
                <div className="mt-3 rounded-[1.25rem] border border-[var(--landing-border)] bg-[var(--landing-surface-alt)] p-3 text-sm text-[var(--landing-text)] sm:rounded-2xl sm:p-4">
                  <div className="font-medium">Customer concentration</div>
                  <div className="mt-2 leading-6 text-[var(--landing-muted)]">
                    "Top two accounts represented 38% of FY25 revenue..."
                  </div>
                  <div className="mt-3 font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                    CIM • Page 27
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-[var(--landing-border)] bg-[var(--landing-inverse)] p-3 text-white sm:rounded-[1.5rem] sm:p-4">
                <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
                  IC Summary
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-white/78">
                  <p>
                    Brightwater shows the strongest near-term growth profile, but
                    carries concentration exposure that should be resolved before
                    advancing.
                  </p>
                  <p>
                    Glenmoor is lower-volatility and easier to underwrite,
                    though current upside appears more limited.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </LandingPanel>
      </div>
    </LandingSection>
  );
}
