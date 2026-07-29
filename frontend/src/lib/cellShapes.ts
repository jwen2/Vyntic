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
  return value
    .replace(/\[Source\s+\d+\]/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

// Symbols/words meaning the same as a kv pair's `unit`. The model often writes
// the unit into the value *and* the unit field ("2.00% of commitments" + unit
// "percent"), which reads as "…of commitments percent" when naively joined.
const UNIT_SYNONYMS: Record<string, string[]> = {
  percent: ["%", "percent", "pct"],
  "%": ["%", "percent", "pct"],
  usd: ["$", "usd", "dollar"],
  eur: ["€", "eur", "euro"],
  gbp: ["£", "gbp", "pound"],
  jpy: ["¥", "jpy", "yen"],
};

/** True when the value already conveys the unit. Mirrors `_unit_is_redundant`. */
function unitIsRedundant(value: string | number, unit: string): boolean {
  if (!unit) return true;
  const text = String(value).toLowerCase();
  const key = unit.trim().toLowerCase();
  return (UNIT_SYNONYMS[key] ?? [key]).some((token) => token && text.includes(token));
}

/**
 * A copy of the shape with `[Source N]` markers removed from its text fields.
 * Only the text-bearing shapes carry markers; the scalar ones are returned
 * untouched.
 */
export function stripShapeSources(shape: CellShape): CellShape {
  switch (shape.kind) {
    case "prose":
      return {
        ...shape,
        summary: stripSourceMarkers(shape.summary ?? ""),
        body: stripSourceMarkers(shape.body ?? ""),
        caveats: (shape.caveats ?? []).map((caveat) => ({
          ...caveat,
          text: stripSourceMarkers(caveat.text ?? ""),
        })),
      };
    case "list":
      return {
        ...shape,
        items: (shape.items ?? []).map((item) => ({
          ...item,
          text: stripSourceMarkers(item.text ?? ""),
        })),
      };
    case "kv":
      return {
        ...shape,
        pairs: (shape.pairs ?? []).map((pair) => ({
          ...pair,
          key: stripSourceMarkers(pair.key ?? ""),
          value: typeof pair.value === "string" ? stripSourceMarkers(pair.value) : pair.value,
          unit: typeof pair.unit === "string" ? stripSourceMarkers(pair.unit) : pair.unit,
        })),
      };
    default:
      return shape;
  }
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
export function displayText(input: unknown, compact = false, stripSources = false): string {
  const shape = asShape(input);
  if (!shape) return "";
  // Strip per field, before formatting — stripping the joined output would
  // leave the separator's leading space behind ("Drop-dead date ; HSR failure").
  if (stripSources) return displayText(stripShapeSources(shape), compact);
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
          const suffix = unitIsRedundant(pair.value, unit) ? "" : ` ${unit}`;
          return `${pair.key}: ${pair.value}${suffix}`;
        });
      if (lines.length === 0) return "";
      return compact ? lines.join("; ") : lines.map((line) => `- ${line}`).join("\n");
    }
    default:
      return assertNever(shape);
  }
}
