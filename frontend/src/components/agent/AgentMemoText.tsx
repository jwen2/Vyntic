"use client";

import BoldText from "./BoldText";

type MemoBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function normalizeMemoText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+(#{1,3}\s+)/g, "\n$1")
    .replace(/([^\n])\s+([*-]\s+)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMemoBlocks(text: string): MemoBlock[] {
  const lines = normalizeMemoText(text).split("\n");
  const blocks: MemoBlock[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  }

  function flushList() {
    if (!listType || !listItems.length) return;
    blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3",
        text: heading[2].trim(),
      });
      continue;
    }

    const unordered = line.match(/^[*-]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1].trim());
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export default function AgentMemoText({ text }: { text: string }) {
  const blocks = parseMemoBlocks(text);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return (
            <h2 key={index} style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.3, margin: 0 }}>
              <BoldText text={block.text} />
            </h2>
          );
        }
        if (block.type === "h2") {
          return (
            <h3 key={index} style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", lineHeight: 1.35, margin: "4px 0 0", paddingTop: 6, borderTop: index > 1 ? "1px solid #f1f5f9" : "none" }}>
              <BoldText text={block.text} />
            </h3>
          );
        }
        if (block.type === "h3") {
          return (
            <h4 key={index} style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", lineHeight: 1.35, margin: "2px 0 -2px" }}>
              <BoldText text={block.text} />
            </h4>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7, listStyle: "none" }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 7, fontSize: 13, color: "#475569", lineHeight: 1.65 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#94a3b8", marginTop: 9, justifySelf: "center" }} />
                  <span><BoldText text={item} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={index} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7, listStyle: "none", counterReset: "memo-counter" }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8, fontSize: 13, color: "#475569", lineHeight: 1.65 }}>
                  <span className="font-mono-dm" style={{ width: 22, height: 22, borderRadius: "50%", background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    {itemIndex + 1}
                  </span>
                  <span><BoldText text={item} /></span>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "p") {
          return (
            <p key={index} style={{ margin: 0, fontSize: 13.5, color: "#334155", lineHeight: 1.75 }}>
              <BoldText text={block.text} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
