/**
 * Word-level LCS diff for the Compare view. Splits inputs on whitespace,
 * computes the longest common subsequence, and returns segments tagged
 * as "match" (in both anchor and other) or "diff" (only in other).
 *
 * Adjacent segments of the same kind are merged so the renderer emits one
 * span per chunk rather than one per word. Comparison is case- and
 * punctuation-insensitive; the original surface form from `other` is
 * preserved in the output.
 */

export type DiffSegmentKind = "match" | "diff";

export interface DiffSegment {
  kind: DiffSegmentKind;
  text: string;
}

export interface DiffStats {
  total: number;
  matched: number;
  /** matched / total, in [0, 1]. 1 means identical, 0 means fully divergent. */
  overlap: number;
}

export interface DiffResult {
  segments: DiffSegment[];
  stats: DiffStats;
}

const TOKEN_RE = /\S+|\s+/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

function normalize(token: string): string {
  // Strip punctuation for matching. ASCII-only is fine — this is only used
  // for diff comparison, not display, and PE deal docs are English.
  return token.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Compute LCS membership for `other` against `anchor`. Returns a boolean
 * array the same length as `other` non-whitespace tokens — true means the
 * token is part of the LCS (i.e. matches the anchor in order).
 *
 * Uses O(n*m) time and space. Inputs are paragraphs, not chapters; this
 * is fine in practice (a 500-word body vs 500-word body = 250k cells, ~1ms).
 */
function lcsMembership(anchor: string[], other: string[]): boolean[] {
  const m = anchor.length;
  const n = other.length;
  // dp[i][j] = LCS length of anchor[..i], other[..j]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (anchor[i] === other[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
      else dp[i + 1][j + 1] = Math.max(dp[i][j + 1], dp[i + 1][j]);
    }
  }
  // Walk back to flag which positions in `other` are part of the LCS.
  const inLcs = new Array(n).fill(false);
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (anchor[i - 1] === other[j - 1]) {
      inLcs[j - 1] = true;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return inLcs;
}

export function diffWords(anchor: string, other: string): DiffResult {
  const otherTokens = tokenize(other);
  if (!anchor.trim() || !other.trim()) {
    return {
      segments: otherTokens.length ? [{ kind: "diff", text: other }] : [],
      stats: { total: 0, matched: 0, overlap: 0 },
    };
  }

  const anchorWords = tokenize(anchor)
    .filter((t) => /\S/.test(t))
    .map(normalize);
  const otherWordIndices: number[] = [];
  const otherWordsNorm: string[] = [];
  otherTokens.forEach((tok, idx) => {
    if (/\S/.test(tok)) {
      otherWordIndices.push(idx);
      otherWordsNorm.push(normalize(tok));
    }
  });

  const inLcs = lcsMembership(anchorWords, otherWordsNorm);

  // Walk `other` token by token, tagging each non-whitespace token by LCS
  // membership. Whitespace inherits the kind of the token it follows so
  // segments stay visually contiguous.
  const segments: DiffSegment[] = [];
  let lastKind: DiffSegmentKind = "match";
  let wordIdx = 0;
  for (let t = 0; t < otherTokens.length; t++) {
    const token = otherTokens[t];
    let kind: DiffSegmentKind;
    if (/\S/.test(token)) {
      kind = inLcs[wordIdx] ? "match" : "diff";
      wordIdx++;
      lastKind = kind;
    } else {
      kind = lastKind;
    }
    const tail = segments[segments.length - 1];
    if (tail && tail.kind === kind) tail.text += token;
    else segments.push({ kind, text: token });
  }

  const matched = inLcs.filter(Boolean).length;
  const total = otherWordsNorm.length;
  return {
    segments,
    stats: {
      total,
      matched,
      overlap: total === 0 ? 0 : matched / total,
    },
  };
}
