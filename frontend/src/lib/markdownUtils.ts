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

  function rowCells(row: string): string[] {
    const trimmed = row.trim();
    const withoutEdges = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "");
    return withoutEdges.split("|").map((cell) => cell.trim());
  }

  function extractInlineRows(tableContent: string, cols: number): string[] {
    const rows: string[] = [];
    const rowRe = new RegExp(
      "\\|" + Array.from({ length: cols }, () => "([^|]*)").join("\\|") + "\\|",
      "g"
    );
    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(tableContent)) !== null) {
      const cells = match.slice(1).map((cell) => cell.trim());
      rows.push("| " + cells.join(" | ") + " |");
    }
    return rows;
  }

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

    // Preserve intentionally blank cells. LLMs often emit tables as one long
    // pipe-delimited run; matching complete rows avoids shifting sparse tables.
    let rows = extractInlineRows(tableContent.replace(/\s+/g, " "), cols);
    if (rows.length < 2) {
      const cells = rowCells(tableContent.replace(/\s+/g, " "));
      rows = [];
      for (let j = 0; j + cols <= cells.length; j += cols) {
        rows.push("| " + cells.slice(j, j + cols).join(" | ") + " |");
      }
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

  // ── Third pass: split body rows that glued multiple records together ──
  // Once a separator establishes the column count N, any subsequent body row
  // with k*N cells (k >= 2) is split into k rows. If the row has extra cells
  // that look like non-table markdown (heading, blockquote, list), peel them
  // off and emit them after the table — models sometimes glue the next
  // section's content onto the last table row.
  const split: string[] = [];
  const looksLikeBlock = /^(#{1,6}\s|>\s?|[-*]\s|\d+\.\s|```)/;
  let cols = 0;
  for (const line of final) {
    const trimmed = line.trim();
    const sepMatch = trimmed.match(
      /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/
    );
    if (sepMatch) {
      cols = (trimmed.match(/-{3,}/g) || []).length;
      split.push(line);
      continue;
    }
    if (
      cols >= 2 &&
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      !trimmed.includes("---")
    ) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.length > cols) {
        if (cells.length % cols === 0) {
          for (let j = 0; j < cells.length; j += cols) {
            split.push("| " + cells.slice(j, j + cols).join(" | ") + " |");
          }
          continue;
        }
        const trailing = cells.slice(cols);
        if (trailing.some((c) => looksLikeBlock.test(c))) {
          split.push("| " + cells.slice(0, cols).join(" | ") + " |");
          split.push("");
          trailing.forEach((c) => split.push(c));
          cols = 0;
          continue;
        }
      }
    } else if (trimmed === "" || !trimmed.startsWith("|")) {
      cols = 0;
    }
    split.push(line);
  }

  // ── Fourth pass: drop tables where every value column is "Not found"-like ──
  // For a table with N >= 2 columns, treat column 0 as the label and columns
  // 1..N-1 as values. If every body row has every value cell match the empty
  // pattern, replace the whole table with a brief placeholder so the section
  // doesn't render as a wall of "Not found" rows.
  const emptyValue = /^(not\s*found|n\/?a|none|null|—|–|-+|tbd|unknown|)$/i;
  const cleaned: string[] = [];
  let i = 0;
  while (i < split.length) {
    const trimmed = split[i].trim();
    const next = i + 1 < split.length ? split[i + 1].trim() : "";
    const isHeader = trimmed.startsWith("|") && trimmed.endsWith("|");
    const isSep = /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/.test(next);
    if (isHeader && isSep) {
      const tableCols = trimmed.slice(1, -1).split("|").length;
      const bodyStart = i + 2;
      let bodyEnd = bodyStart;
      while (bodyEnd < split.length) {
        const bt = split[bodyEnd].trim();
        if (!bt.startsWith("|") || !bt.endsWith("|")) break;
        bodyEnd++;
      }
      let allEmpty = bodyEnd > bodyStart && tableCols >= 2;
      for (let r = bodyStart; r < bodyEnd && allEmpty; r++) {
        const cells = split[r]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        for (let c = 1; c < tableCols && allEmpty; c++) {
          if (!emptyValue.test(cells[c] || "")) allEmpty = false;
        }
      }
      if (allEmpty) {
        cleaned.push("_No data found in scanned documents._");
        i = bodyEnd;
        continue;
      }
    }
    cleaned.push(split[i]);
    i++;
  }

  return cleaned.join("\n");
}
