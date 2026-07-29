/**
 * The typed-cell shape contract — the TS mirror of `backend/app/services/workflow_shapes.py`.
 *
 * Every `TabularCell.answer_formatted` the API returns is either null or a
 * shape carrying a `kind` discriminant. The backend normalizes legacy untagged
 * payloads at its store boundary, so by the time a shape reaches this file the
 * tag is guaranteed — the frontend never key-sniffs (`"pairs" in obj`) again.
 *
 * Adding a shape means adding a `kind` to `CellShape`. Every `switch` over
 * `shape.kind` that uses `assertNever` in its default branch then fails to
 * compile until it handles the new case. That is the point: this file exists so
 * a missing case is a build error rather than raw JSON rendered at an analyst.
 */

export interface Caveat {
  text: string;
  severity: "info" | "warn" | "risk";
  citation_ids?: string[];
}

export interface ListItem {
  text: string;
  citation_ids?: string[];
}

export interface KVPair {
  key: string;
  value: string | number;
  unit?: string | null;
}

export type MetricShape = {
  kind: "metric";
  value: number | null;
  unit?: string | null;
  period?: string | null;
  raw?: string | null;
};
export type DateShape = { kind: "date"; iso: string; granularity: "day" | "month" | "quarter" | "year" };
export type BoolShape = { kind: "bool"; value: boolean };
export type EnumShape = { kind: "enum"; value: string; allowed?: string[] };
export type CurrencyShape = { kind: "currency"; codes: string[] };
export type ProseShape = { kind: "prose"; summary: string; body: string; caveats: Caveat[] };
export type ListShape = { kind: "list"; items: ListItem[]; ordered: boolean };
export type KVShape = { kind: "kv"; pairs: KVPair[] };

export type CellShape =
  | MetricShape
  | DateShape
  | BoolShape
  | EnumShape
  | CurrencyShape
  | ProseShape
  | ListShape
  | KVShape;

export type CellShapeKind = CellShape["kind"];

const SHAPE_KINDS: readonly CellShapeKind[] = [
  "metric",
  "date",
  "bool",
  "enum",
  "currency",
  "prose",
  "list",
  "kv",
] as const;

/**
 * Narrow an untrusted `answer_formatted` to a tagged shape.
 *
 * Only checks that `kind` is one this build knows about — it deliberately does
 * NOT re-derive the shape from its keys. That inference lives in exactly one
 * place (the backend's `normalize_shape`); duplicating it here is what caused
 * the drift this contract removes. An unknown `kind` (an older frontend against
 * a newer backend) yields null, and callers fall back to the raw answer.
 */
export function asShape(value: unknown): CellShape | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && (SHAPE_KINDS as readonly string[]).includes(kind)
    ? (value as CellShape)
    : null;
}

/** Exhaustiveness guard for `switch (shape.kind)` default branches. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled cell shape: ${JSON.stringify(value)}`);
}

export function stripSourceMarkers(value: string): string {
  return value.replace(/\[Source\s+\d+\]/gi, "").trim();
}

function metricText(shape: MetricShape): string {
  const raw = (shape.raw ?? "").trim();
  if (raw) return raw;
  if (shape.value == null) return "";
  return [String(shape.value), shape.unit].filter(Boolean).join(" ");
}

/**
 * Flatten a shape to analyst-readable text — the TS twin of the backend's
 * `display_text`, for the surfaces that hold a shape locally (previews,
 * client-derived rows) rather than a server-sent `cell.answer_display`.
 *
 * `compact` yields the one-line form (prose summary, joined list items); the
 * default yields the full form, with list/kv rendered as markdown so
 * `AnswerText` shows real bullets.
 */
export function displayText(input: unknown, compact = false): string {
  const shape = asShape(input);
  if (!shape) return "";
  switch (shape.kind) {
    case "metric": {
      const text = metricText(shape);
      return shape.period && !text.includes(String(shape.period))
        ? `${text} (${shape.period})`.trim()
        : text;
    }
    case "date":
      return shape.iso ?? "";
    case "bool":
      return shape.value ? "Yes" : "No";
    case "enum":
      return shape.value ?? "";
    case "currency":
      return (shape.codes ?? []).join(", ");
    case "prose": {
      const summary = (shape.summary ?? "").trim();
      const body = (shape.body ?? "").trim();
      return compact ? summary || body : body || summary;
    }
    case "list": {
      const items = (shape.items ?? [])
        .map((item) => (item?.text ?? "").trim())
        .filter(Boolean);
      if (items.length === 0) return "";
      if (compact) return items.join("; ");
      return items
        .map((text, index) => (shape.ordered ? `${index + 1}. ${text}` : `- ${text}`))
        .join("\n");
    }
    case "kv": {
      const lines = (shape.pairs ?? [])
        .filter((pair) => pair?.key && pair?.value != null)
        .map((pair) => {
          const unit = (pair.unit ?? "").trim();
          return `${pair.key}: ${pair.value}${unit ? ` ${unit}` : ""}`;
        });
      if (lines.length === 0) return "";
      return compact ? lines.join("; ") : lines.map((line) => `- ${line}`).join("\n");
    }
    default:
      return assertNever(shape);
  }
}
