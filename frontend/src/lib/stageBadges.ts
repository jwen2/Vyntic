/**
 * Deal/fund stage badge palettes, shared by the home deal list and the deal
 * workspace top bar so a stage reads with the same hue everywhere it appears.
 *
 * Contrast-checked in both themes: label ≥ 7.3:1 against its chip background,
 * light chip border ≥ 2.7:1 against a white card. Hue advances with the deal
 * (teal Screening → cobalt Diligence → violet IC); terminal stages invert to
 * ink so "done" reads at a glance.
 */
export interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
}

export const STAGE_STYLES: Record<string, BadgeStyle> = {
  Screening: { bg: "#e4f6f3", fg: "#20554c", border: "#73a59d" },
  "Due Diligence": { bg: "#e1e7fa", fg: "#21429c", border: "#6e85c4" },
  "IC Review": { bg: "#e9e3f8", fg: "#50309c", border: "#8e7cb6" },
  Closed: { bg: "#111111", fg: "#ffffff", border: "#111111" },
  // Fund lifecycle stages
  Diligence: { bg: "#e1e7fa", fg: "#21429c", border: "#6e85c4" },
  IC: { bg: "#e9e3f8", fg: "#50309c", border: "#8e7cb6" },
  Committed: { bg: "#111111", fg: "#ffffff", border: "#111111" },
  Monitoring: { bg: "#e5f6e7", fg: "#23582c", border: "#76a77e" },
  "Re-up review": { bg: "#f9f2e2", fg: "#624c18", border: "#b39a61" },
};

export const DARK_STAGE_STYLES: Record<string, BadgeStyle> = {
  Screening: { bg: "#152321", fg: "#59c0af", border: "#2c4440" },
  "Due Diligence": { bg: "#151923", fg: "#97a9d8", border: "#2c3244" },
  "IC Review": { bg: "#191523", fg: "#b19fdb", border: "#332c44" },
  Closed: { bg: "#f5f5f5", fg: "#111111", border: "#f5f5f5" },
  // Fund lifecycle stages
  Diligence: { bg: "#151923", fg: "#97a9d8", border: "#2c3244" },
  IC: { bg: "#191523", fg: "#b19fdb", border: "#332c44" },
  Committed: { bg: "#f5f5f5", fg: "#111111", border: "#f5f5f5" },
  Monitoring: { bg: "#152317", fg: "#60c370", border: "#2c4430" },
  "Re-up review": { bg: "#231f15", fg: "#c7ab6b", border: "#443d2c" },
};

/** Badge style for a stage, or null if the stage is unrecognized (caller supplies a neutral fallback). */
export function stageBadge(stage: string, isDark: boolean): BadgeStyle | null {
  return (isDark ? DARK_STAGE_STYLES : STAGE_STYLES)[stage] ?? null;
}
