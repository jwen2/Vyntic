/**
 * Normalizes malformed markdown tables in LLM output.
 *
 * Handles all observed failure modes:
 *  - Table rows concatenated on a single line
 *  - Table glued directly to preceding text (no newline)
 *  - Header row split across multiple lines (e.g., "| Segment\n\n| rest...")
 *  - Missing blank lines before/after tables
 *
 * Strategy: process line-by-line. When a line contains a separator row
 * (| --- | --- |) PLUS other content, it's a concatenated table that needs
 * splitting. Uses the separator's column count to group pipe-delimited
 * cells into proper rows.
 */
export function fixMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Does this line contain a table separator?
    const sepMatch = line.match(
      /\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|/
    );

    if (!sepMatch || line.trim() === sepMatch[0]) {
      // No separator, or separator is already alone on its line — pass through
      output.push(line);
      continue;
    }

    // ── This line has a separator PLUS other table content (concatenated). ──
    const cols = (sepMatch[0].match(/-{3,}/g) || []).length;

    // Pull any partial-header lines that precede this line
    // (e.g., "| Segment" on its own line before the big concatenated line)
    let partialHeader = "";
    let linesToRemove = 0;
    for (let j = output.length - 1; j >= 0; j--) {
      const prev = output[j].trim();
      if (prev === "") {
        linesToRemove++;
        continue;
      }
      if (prev.startsWith("|")) {
        partialHeader = prev + " " + partialHeader;
        linesToRemove++;
        continue;
      }
      break;
    }
    if (linesToRemove > 0) {
      output.splice(output.length - linesToRemove, linesToRemove);
    }

    const fullLine = (partialHeader + line).trim();

    // Separate any non-table prefix text (e.g., "...by FY2025E [1].")
    const firstPipe = fullLine.indexOf("|");
    const prefix = firstPipe > 0 ? fullLine.slice(0, firstPipe).trim() : "";
    const tableContent = fullLine.slice(Math.max(0, firstPipe));

    // Collapse all whitespace → split by | → trim each cell → drop empties
    const cells = tableContent
      .replace(/\s+/g, " ")
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    // Group cells into rows of `cols` columns
    const rows: string[] = [];
    for (let j = 0; j + cols <= cells.length; j += cols) {
      rows.push("| " + cells.slice(j, j + cols).join(" | ") + " |");
    }

    if (rows.length < 2) {
      // Couldn't form a valid table (need header + separator at minimum)
      output.push(line);
      continue;
    }

    // Emit prefix text, then blank line, then the rebuilt table
    if (prefix) {
      output.push(prefix);
      output.push("");
    } else if (
      output.length > 0 &&
      output[output.length - 1].trim() !== ""
    ) {
      output.push("");
    }
    rows.forEach((r) => output.push(r));
  }

  // ── Second pass: ensure a blank line before any table header ──
  // A "table header" is a pipe row immediately followed by a separator row.
  // This catches properly-formatted tables that are just missing the blank line.
  const final: string[] = [];
  for (let i = 0; i < output.length; i++) {
    const curr = output[i].trim();
    const next = i + 1 < output.length ? output[i + 1].trim() : "";
    const isSepRow = /^\|\s*:?-{3,}/.test(next) && next.endsWith("|");
    const isTableHeader =
      curr.startsWith("|") && curr.endsWith("|") && isSepRow;

    if (
      isTableHeader &&
      final.length > 0 &&
      final[final.length - 1].trim() !== ""
    ) {
      final.push("");
    }
    final.push(output[i]);
  }

  return final.join("\n");
}
