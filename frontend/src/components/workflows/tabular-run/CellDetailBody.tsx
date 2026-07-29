import type { Citation } from "@/lib/api";
import type { TabularCell } from "@/lib/workflows";
import AnswerText from "@/components/dd/AnswerText";
import Card from "@/components/ui/Card";
import { asShape, assertNever, pairText } from "@/lib/cellShapes";
import { AMBER } from "../theme";
import { demoteHeadings } from "./format";

/**
 * The answer region of the Cell Detail rail.
 *
 * `kv` and `list` cells render as typed panels — a label/value row per pair,
 * an indexed row per item — rather than as the flattened markdown bullets
 * `answer_display` produces. The flattened form is correct but reads as prose;
 * these shapes are records, and an analyst scans them as fields.
 *
 * Every text run still goes through `AnswerText`, so the `[Source N]` markers
 * the backend now preserves become clickable citation chips anchored to the
 * individual pair or item they support — not just to the cell as a whole.
 *
 * Prose, markdown, and shapeless (text) columns keep the single-body rendering:
 * they *are* prose, and splitting them into fields would invent structure the
 * model never expressed.
 */
export default function CellDetailBody({
  cell,
  citations,
  activeCitId,
  onCitationClick,
}: {
  cell: TabularCell;
  citations: (Citation | null)[];
  activeCitId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const shape = asShape(cell.answer_formatted);

  if (shape) {
    switch (shape.kind) {
      case "kv": {
        const pairs = (shape.pairs ?? []).filter((pair) => pair?.key && pair?.value != null);
        if (pairs.length === 0) break;
        return (
          <Card level="inner" tone="alt" padding={0}>
            {pairs.map((pair, index) => (
              <FieldRow key={`${pair.key}-${index}`} last={index === pairs.length - 1}>
                <div className="text-t3 text-[9.5px] font-extrabold uppercase tracking-[0.06em] mb-[3px]">
                  {pair.key}
                </div>
                <div className="text-t1 text-[11.5px]">
                  <AnswerText
                    text={pairText(pair.value, pair.unit)}
                    citations={citations}
                    activeCitId={activeCitId}
                    onCit={onCitationClick}
                  />
                </div>
              </FieldRow>
            ))}
          </Card>
        );
      }
      case "list": {
        const items = (shape.items ?? []).filter((item) => (item?.text ?? "").trim());
        if (items.length === 0) break;
        return (
          <Card level="inner" tone="alt" padding={0}>
            {items.map((item, index) => (
              <FieldRow key={`${item.text}-${index}`} last={index === items.length - 1}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    className="text-[10px] font-extrabold tabular-nums"
                    // The marker is an accent hue, not a token.
                    style={{ color: AMBER, flexShrink: 0, paddingTop: 2 }}
                  >
                    {shape.ordered ? `${index + 1}.` : "•"}
                  </span>
                  <div className="text-t1 text-[11.5px] min-w-0">
                    <AnswerText
                      text={item.text}
                      citations={citations}
                      activeCitId={activeCitId}
                      onCit={onCitationClick}
                    />
                  </div>
                </div>
              </FieldRow>
            ))}
          </Card>
        );
      }
      // Scalar and prose shapes have no field structure worth breaking out —
      // they fall through to the single-body rendering below.
      case "metric":
      case "date":
      case "bool":
      case "enum":
      case "currency":
      case "prose":
        break;
      default:
        return assertNever(shape);
    }
  }

  const text = demoteHeadings(cell.answer_display?.trim() || cell.answer || "").trim();
  if (!text) {
    return <span className="text-t3">No answer captured for this cell yet.</span>;
  }
  return (
    <AnswerText
      text={text}
      citations={citations}
      activeCitId={activeCitId}
      onCit={onCitationClick}
    />
  );
}

function FieldRow({ children, last }: { children: React.ReactNode; last: boolean }) {
  return (
    <div
      className={last ? "px-3 py-2.5" : "px-3 py-2.5 border-b border-b-edge"}
      style={{ minWidth: 0 }}
    >
      {children}
    </div>
  );
}

