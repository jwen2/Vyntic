"use client";
import { QuestionResult } from "./WorkstreamPanel";

interface RiskDimension {
  label: string;
  question: string;
  score: number | null;
  level: "low" | "medium" | "high" | "critical" | null;
}

/** Parse a 1-5 score from the LLM answer text */
function parseScore(answer: string): number | null {
  // Match patterns like "Score: 3", "3/5", "risk score of 3", "rating: 3"
  const patterns = [
    /(?:score|rating|risk)[:\s]*(\d)(?:\s*\/\s*5)?/i,
    /(\d)\s*(?:\/\s*5|out\s+of\s+5)/i,
    /\*\*(\d)(?:\/5)?\*\*/,
  ];
  for (const pattern of patterns) {
    const match = answer.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 5) return n;
    }
  }
  return null;
}

function scoreToLevel(
  score: number | null
): "low" | "medium" | "high" | "critical" | null {
  if (score === null) return null;
  if (score <= 2) return "low";
  if (score === 3) return "medium";
  if (score === 4) return "high";
  return "critical";
}

const LEVEL_CONFIG = {
  low: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    label: "Low Risk",
    bar: "bg-emerald-500",
  },
  medium: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    label: "Medium Risk",
    bar: "bg-amber-500",
  },
  high: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-800",
    dot: "bg-orange-500",
    label: "High Risk",
    bar: "bg-orange-500",
  },
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-800",
    dot: "bg-red-500",
    label: "Critical",
    bar: "bg-red-500",
  },
};

interface Props {
  results: Record<string, QuestionResult>;
  questionLabels: { label: string; query: string }[];
}

export default function RiskScorecard({ results, questionLabels }: Props) {
  // Build dimensions from completed results (skip the summary question)
  const dimensions: RiskDimension[] = questionLabels
    .filter((t) => !t.label.toLowerCase().includes("overall risk summary"))
    .map((t) => {
      const r = results[t.query];
      const score =
        r?.status === "complete" ? parseScore(r.answer) : null;
      return {
        label: t.label.replace(/ risk$/i, ""),
        question: t.query,
        score,
        level: scoreToLevel(score),
      };
    });

  const scoredDimensions = dimensions.filter((d) => d.score !== null);
  const avgScore =
    scoredDimensions.length > 0
      ? scoredDimensions.reduce((sum, d) => sum + (d.score || 0), 0) /
        scoredDimensions.length
      : null;
  const overallLevel = scoreToLevel(avgScore ? Math.round(avgScore) : null);

  if (scoredDimensions.length === 0) {
    return null;
  }

  return (
    <div className="mx-4 mt-4 mb-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-base">🚦</span>
            Risk Scorecard
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {scoredDimensions.length} of {dimensions.length} dimensions scored
          </p>
        </div>
        {overallLevel && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${LEVEL_CONFIG[overallLevel].badge}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${LEVEL_CONFIG[overallLevel].dot}`}
            />
            Overall: {avgScore?.toFixed(1)}/5 — {LEVEL_CONFIG[overallLevel].label}
          </div>
        )}
      </div>

      {/* Risk bars */}
      <div className="px-5 py-3 space-y-2.5">
        {dimensions.map((dim) => {
          const config = dim.level ? LEVEL_CONFIG[dim.level] : null;
          return (
            <div key={dim.label} className="flex items-center gap-3">
              {/* Label */}
              <div className="w-44 text-xs font-medium text-gray-700 truncate">
                {dim.label}
              </div>

              {/* Bar */}
              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                {dim.score !== null && config ? (
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${config.bar}`}
                    style={{ width: `${(dim.score / 5) * 100}%` }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[10px] text-gray-400">
                    Not yet scored
                  </div>
                )}
              </div>

              {/* Score badge */}
              <div className="w-20 flex justify-end">
                {dim.score !== null && config ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.badge}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${config.dot}`}
                    />
                    {dim.score}/5
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-300">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
