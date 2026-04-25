"use client";

import { ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";

export default function BoldText({ text }: { text: string }) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} style={{ fontWeight: 700, color: c.t1 }}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
