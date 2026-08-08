import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocMatrixEvent, QueryStreamEvent } from "@/lib/api";
import { docMatrixStream } from "@/lib/api";
import { disableDemoMode, enableDemoMode } from "../mode";
import {
  COL_ODD_CONFLICTS,
  DEMO_PROMPT_CARDS,
  DEMO_QUESTIONS,
  DOC_MATRIX_UNAVAILABLE,
  OFF_SCRIPT_ANSWER,
  WF_ODD_SCREEN,
  cited,
  demoPromptCardsFor,
  demoSseStream,
  matchDemoQuestion,
} from "./chat";
import { DEMO_DDQ_RUN } from "./workflows";
import { DEMO_FUND_III_ID, DEMO_FUND_IV_ID } from "./entities";

const CHAT_URL = `/api/deals/${DEMO_FUND_IV_ID}/query/stream`;

/** Every citation object the recorded run emitted, flattened and de-nulled. */
const RECORDED_CITATIONS = DEMO_DDQ_RUN.cells
  .flatMap((cell) => cell.citations)
  .filter((citation) => citation !== null);

function citationKey(source_file: string, page: number, text_snippet: string): string {
  return `${source_file}|${page}|${text_snippet}`;
}

const RECORDED_KEYS = new Set(
  RECORDED_CITATIONS.map((c) => citationKey(c.source_file, c.page, c.text_snippet))
);

afterEach(() => {
  vi.useRealTimers();
});

describe("demo chat question set", () => {
  it("ships between five and six questions", () => {
    expect(DEMO_QUESTIONS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_QUESTIONS.length).toBeLessThanOrEqual(6);
  });

  it("cites only citations the recorded run actually produced", () => {
    for (const q of DEMO_QUESTIONS) {
      expect(q.citations.length).toBeGreaterThan(0);
      for (const c of q.citations) {
        expect(RECORDED_KEYS.has(citationKey(c.source_file, c.page, c.text_snippet))).toBe(true);
      }
    }
  });

  it("cites only real corpus filenames on a real page", () => {
    for (const q of DEMO_QUESTIONS) {
      for (const c of q.citations) {
        expect(c.source_file).toMatch(/^(brightwater|glenmoor)_.*\.(pdf|xlsx)$/);
        expect(c.page).toBeGreaterThan(0);
      }
    }
  });

  it("numbers every [Source N] marker densely against its own citation list", () => {
    for (const q of DEMO_QUESTIONS) {
      const used = [...q.answer.matchAll(/\[Source\s+(\d+)\]/g)].map((m) => Number(m[1]));
      expect(used.length).toBeGreaterThan(0);
      for (const n of used) {
        // AnswerText resolves [Source N] to citations[N - 1]; an index past the
        // end silently drops the badge, which is how a demo loses its citations.
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(q.citations.length);
      }
      // No citation is carried without being referenced from the prose.
      for (let i = 1; i <= q.citations.length; i += 1) {
        expect(used).toContain(i);
      }
    }
  });

  it("covers the findings the recorded run actually made", () => {
    expect(matchDemoQuestion("what about roache", DEMO_FUND_IV_ID)).not.toBeNull();
    expect(matchDemoQuestion("has there been a deficiency letter", DEMO_FUND_IV_ID)).not.toBeNull();
    expect(matchDemoQuestion("do they have a soc 2 report", DEMO_FUND_IV_ID)).not.toBeNull();
    expect(matchDemoQuestion("how are level 3 assets reviewed", DEMO_FUND_IV_ID)).not.toBeNull();
    expect(matchDemoQuestion("what is the fee offset", DEMO_FUND_IV_ID)).not.toBeNull();
  });

  it("asserts no finding the recorded run contradicts", () => {
    const prose = DEMO_QUESTIONS.map((q) => `${q.question} ${q.answer}`.toLowerCase()).join(" ");
    // The recording found the DDQ/PPM/pitchbook *consistent* on fees and found
    // no affiliated broker-dealer. Both are real in the corpus, but the fixture
    // does not contain them, so the demo must not claim them.
    expect(prose).not.toContain("100% fee offset");
    expect(prose).not.toContain("brightwater securities");
    expect(prose).not.toContain("broker-dealer");
  });

  it("never tells a prospect the documents agree on the fee terms", () => {
    // The DDQ's own p7 answers "100% of such fees", against the 50% offset in
    // the LPA and PPM, and the recorded run cited neither p7 nor the mismatch.
    // Repeating the recording's "consistent" conclusion would convert a silent
    // miss into an active false statement — worse in front of an LP, who can
    // open the DDQ this demo itself ships and see the contradiction.
    const terms = matchDemoQuestion("what is the fee offset", DEMO_FUND_IV_ID);
    expect(terms).not.toBeNull();
    expect(terms!.answer).not.toMatch(/consistent/i);
    const prose = DEMO_QUESTIONS.map((q) => `${q.question} ${q.answer}`).join(" ");
    expect(prose).not.toMatch(/terms are consistent/i);
  });

  it("offers no conflicts-of-interest question at all", () => {
    // Form ADV p6 discloses Brightwater Securities, LLC — an affiliated
    // broker-dealer that "may receive transaction fees". The recorded run cited
    // every ADV page except p6 and reported the manager's denial instead, so
    // every conflicts question is a landmine no rephrasing defuses.
    expect(matchDemoQuestion("what conflicts of interest are disclosed", DEMO_FUND_IV_ID)).toBeNull();
    expect(
      matchDemoQuestion("what conflicts of interest exist with brightwater securities", DEMO_FUND_IV_ID)
    ).toBeNull();
    expect(matchDemoQuestion("are there affiliated service providers", DEMO_FUND_IV_ID)).toBeNull();
    const titles = DEMO_QUESTIONS.map((q) => q.question.toLowerCase()).join(" ");
    expect(titles).not.toContain("conflict");
  });

  it("attaches no citation to a page that does not support its claim", () => {
    const valuation = matchDemoQuestion("how are level 3 assets reviewed", DEMO_FUND_IV_ID);
    expect(valuation).not.toBeNull();
    // PPM p6 is "Portfolio Construction"; its only quarterly reference is to the
    // *investment* committee, and no PPM page supports the valuation cadence.
    expect(valuation!.citations.some((c) => c.source_file === "brightwater_iv_ppm.pdf")).toBe(
      false
    );
    expect(valuation!.answer).not.toMatch(/DDQ and PPM agree/i);
  });

  it("answers the fee question a prospect is most likely to type", () => {
    // With the false consistency claim gone the terms answer is purely
    // descriptive, so the plainest phrasings must reach it. Answering "what is
    // the fee offset" while refusing "what are the fees" is exactly backwards.
    for (const asked of ["what are the fees", "how much are the fees", "what is the fee structure"]) {
      expect(matchDemoQuestion(asked, DEMO_FUND_IV_ID), asked).not.toBeNull();
    }
  });

  it("lifts citations out of whichever recording the answer came from", () => {
    // The guard against a re-recording that renumbers sources: this must throw
    // in development rather than quietly strip citations off a live screen.
    expect(() => cited(WF_ODD_SCREEN, "not-a-column", [1])).toThrow(/drifted apart/);
    expect(() => cited(WF_ODD_SCREEN, COL_ODD_CONFLICTS, [999])).toThrow(/Source 999/);
  });

  it("falls back on a question that names a fund the run was not recorded against", () => {
    // The dealId gate in demoSseStream covers the workspace you are standing
    // in, not the fund you are asking about. Fund IV's economics are not Fund
    // III's, and the demo ships no Fund III recording.
    expect(matchDemoQuestion("what is the management fee for fund iii", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("carried interest in fund iii", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("gp commitment for fund iii", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("what were the fees in fund ii", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("did anyone leave the firm during fund i", DEMO_FUND_IV_ID)).toBeNull();
    // Naming Fund IV, the fund the run was recorded against, still answers.
    expect(matchDemoQuestion("what is the management fee for fund iv", DEMO_FUND_IV_ID)).not.toBeNull();
  });
});

describe("matchDemoQuestion", () => {
  it("matches a canned question verbatim", () => {
    const q = DEMO_QUESTIONS[0];
    expect(matchDemoQuestion(q.question, DEMO_FUND_IV_ID)?.answer).toBe(q.answer);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const q = DEMO_QUESTIONS[0].question;
    expect(matchDemoQuestion(`  ${q.toUpperCase()}  `, DEMO_FUND_IV_ID)).not.toBeNull();
  });

  it("matches through the composer's document-scope prefix", () => {
    const scoped =
      'Focus on these document(s): "brightwater_iv_ddq.pdf".\n\nwhat about roache';
    expect(matchDemoQuestion(scoped, DEMO_FUND_IV_ID)).toBe(
      matchDemoQuestion("what about roache", DEMO_FUND_IV_ID)
    );
  });

  it("never lets the document-scope prefix answer a question nobody asked", () => {
    // "brightwater_valuation_policy.pdf" normalizes to the tokens "valuation
    // policy" — an anchor of the Level 3 answer. If the prefix were not
    // stripped, ticking that document would make *any* off-script question in
    // the chat come back as a confident, well-cited valuation answer.
    const scoped =
      'Focus on these document(s): "brightwater_valuation_policy.pdf".\n\n' +
      "who is the fund administrator";
    expect(matchDemoQuestion(scoped, DEMO_FUND_IV_ID)).toBeNull();
  });

  it("returns null for off-script input", () => {
    expect(matchDemoQuestion("what is the weather in Chicago", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("   ", DEMO_FUND_IV_ID)).toBeNull();
  });

  it("does not answer a question it only shares one broad topic word with", () => {
    // "valuation" alone must not pull in the Level 3 answer: that answer would
    // be confidently wrong here, which is the one failure this demo cannot have.
    expect(
      matchDemoQuestion("what is the valuation of the largest portfolio company", DEMO_FUND_IV_ID)
    ).toBeNull();
    expect(matchDemoQuestion("how many partners are on the team", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("who audits the fund", DEMO_FUND_IV_ID)).toBeNull();
  });

  it("does not match on a substring of a longer word", () => {
    // " mark " must not fire on "marketing"; " sec " must not fire on "second".
    expect(matchDemoQuestion("send me the marketing deck", DEMO_FUND_IV_ID)).toBeNull();
    expect(matchDemoQuestion("what happened in the second quarter", DEMO_FUND_IV_ID)).toBeNull();
  });

  it("answers only inside the workspace the question belongs to", () => {
    // Every question today is Fund IV's. Asked from Fund III, each must fall
    // back rather than cite Fund IV's DDQ, PPM and pitchbook into a workspace
    // whose context never contains them (CLAUDE.md invariant 2).
    for (const q of DEMO_QUESTIONS) {
      expect(matchDemoQuestion(q.question, q.dealId), q.question).not.toBeNull();
      const otherFund =
        q.dealId === DEMO_FUND_IV_ID ? DEMO_FUND_III_ID : DEMO_FUND_IV_ID;
      expect(matchDemoQuestion(q.question, otherFund), q.question).toBeNull();
    }
  });

  it("returns null for a workspace with no question set at all", () => {
    expect(matchDemoQuestion("what is the management fee", "no_such_deal")).toBeNull();
  });
});

describe("DEMO_PROMPT_CARDS", () => {
  it("offers one card per question, submitting the question verbatim", () => {
    expect(DEMO_PROMPT_CARDS.length).toBe(DEMO_QUESTIONS.length);
    for (const card of DEMO_PROMPT_CARDS) {
      expect(matchDemoQuestion(card.prompt, card.dealId)).not.toBeNull();
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.blurb.length).toBeGreaterThan(0);
      expect(card.chips.length).toBeGreaterThan(0);
    }
  });

  it("offers each fund only its own cards", () => {
    // A card clicked in a sibling fund could only answer off-script, or worse,
    // cite documents that workspace's context never contains (invariant 2).
    const fourth = demoPromptCardsFor(DEMO_FUND_IV_ID);
    const third = demoPromptCardsFor(DEMO_FUND_III_ID);
    expect(fourth.length).toBeGreaterThan(0);
    for (const card of fourth) expect(card.dealId).toBe(DEMO_FUND_IV_ID);
    for (const card of third) expect(card.dealId).toBe(DEMO_FUND_III_ID);
    expect(fourth.length + third.length).toBe(DEMO_PROMPT_CARDS.length);
    expect(demoPromptCardsFor("no_such_deal")).toEqual([]);
  });
});

/** Drives demoSseStream to completion on fake timers. */
function run(url: string, body: unknown) {
  vi.useFakeTimers();
  const events: QueryStreamEvent[] = [];
  const errors: Error[] = [];
  let finished = false;
  const controller = demoSseStream(url, body, {
    onEvent: (event) => {
      if (event && typeof event === "object" && "type" in event) {
        events.push(event as QueryStreamEvent);
      }
    },
    onFinish: () => {
      finished = true;
    },
    onError: (err) => errors.push(err),
  });
  vi.advanceTimersByTime(60_000);
  return { events, errors, controller, isFinished: () => finished };
}

function streamedText(events: QueryStreamEvent[]): string {
  return events
    .filter((e): e is Extract<QueryStreamEvent, { type: "token" }> => e.type === "token")
    .map((e) => e.token)
    .join("");
}

function doneEvent(events: QueryStreamEvent[]) {
  return events.find(
    (e): e is Extract<QueryStreamEvent, { type: "done" }> => e.type === "done"
  );
}

describe("demoSseStream", () => {
  it("streams a canned answer token by token and finishes with citations", () => {
    const q = DEMO_QUESTIONS[0];
    const { events, isFinished } = run(CHAT_URL, { question: q.question });

    expect(streamedText(events)).toBe(q.answer);
    const done = doneEvent(events);
    expect(done?.answer).toBe(q.answer);
    expect(done?.citations).toEqual(q.citations);
    expect(done?.deal_id).toBe(DEMO_FUND_IV_ID);
    expect(isFinished()).toBe(true);
  });

  it("streams the honest fallback for off-script input, with no citations", () => {
    const { events } = run(CHAT_URL, { question: "what is the weather in Chicago" });

    expect(streamedText(events)).toBe(OFF_SCRIPT_ANSWER);
    const done = doneEvent(events);
    expect(done?.answer).toBe(OFF_SCRIPT_ANSWER);
    expect(done?.citations).toEqual([]);
  });

  it("never fabricates an answer off-script", () => {
    expect(OFF_SCRIPT_ANSWER).toContain("fixed set of questions");
    expect(OFF_SCRIPT_ANSWER).not.toMatch(/\[Source\s+\d+\]/);
  });

  it("falls back rather than cite Fund IV documents inside another fund", () => {
    // The recording ran against Fund IV. Answering here would put Fund IV's
    // DDQ, PPM and pitchbook into a sibling fund's workspace, which the real
    // product's per-entity context assembly would never do.
    const url = `/api/deals/${DEMO_FUND_III_ID}/query/stream`;
    const { events } = run(url, { question: DEMO_QUESTIONS[0].question });

    expect(streamedText(events)).toBe(OFF_SCRIPT_ANSWER);
    expect(doneEvent(events)?.citations).toEqual([]);
  });

  it("falls back on a sibling fund's question asked from inside Fund IV", () => {
    const { events } = run(CHAT_URL, {
      question: "what is the management fee for fund iii",
    });

    expect(streamedText(events)).toBe(OFF_SCRIPT_ANSWER);
    expect(doneEvent(events)?.citations).toEqual([]);
  });

  it("errors rather than emit chat-shaped events on a stream it has no fixture for", () => {
    const { events, errors } = run("/api/matrix/compare/stream", {
      query: DEMO_QUESTIONS[0].question,
    });

    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("demo");
  });

  // The doc-matrix controls are removed in demo mode (DocMatrixPanel), so this
  // is the backstop for anything that reaches the stream anyway. Throwing left
  // every cell spinning on "Analyzing…" forever, which reads as a hang.
  it("resolves every doc-matrix cell with an honest message instead of erroring", () => {
    const events: unknown[] = [];
    const errors: Error[] = [];
    let finished = false;
    demoSseStream(
      `/api/deals/${DEMO_FUND_IV_ID}/doc-matrix/stream`,
      { doc_ids: ["doc_a", "doc_b"], query: "Revenue" },
      {
        onEvent: (event) => events.push(event),
        onFinish: () => {
          finished = true;
        },
        onError: (err) => errors.push(err),
      }
    );

    expect(errors).toEqual([]);
    expect(finished).toBe(true);
    expect(events).toEqual([
      { doc_id: "doc_a", error: DOC_MATRIX_UNAVAILABLE },
      { doc_id: "doc_b", error: DOC_MATRIX_UNAVAILABLE },
    ]);
  });

  it("never puts an uncited answer in a doc-matrix cell", () => {
    // `error` is the only shape DocMatrixCell renders as an explanation rather
    // than as an answer — a `done` here would be a confident uncited claim.
    const events: Record<string, unknown>[] = [];
    demoSseStream(
      `/api/deals/${DEMO_FUND_IV_ID}/doc-matrix/stream`,
      { doc_ids: ["doc_a"], query: "Revenue" },
      { onEvent: (event) => events.push(event as Record<string, unknown>) }
    );

    for (const event of events) {
      expect(event.done).toBeUndefined();
      expect(event.answer).toBeUndefined();
      expect(event.token).toBeUndefined();
    }
    expect(DOC_MATRIX_UNAVAILABLE).not.toMatch(/\[Source\s+\d+\]/);
  });

  it("emits nothing for a doc-matrix request with no documents", () => {
    const events: unknown[] = [];
    let finished = false;
    demoSseStream(
      `/api/deals/${DEMO_FUND_IV_ID}/doc-matrix/stream`,
      { query: "Revenue" },
      { onEvent: (event) => events.push(event), onFinish: () => { finished = true; } }
    );

    expect(events).toEqual([]);
    expect(finished).toBe(true);
  });

  it("stops emitting once aborted", () => {
    vi.useFakeTimers();
    const events: QueryStreamEvent[] = [];
    let finished = false;
    const controller = demoSseStream(
      CHAT_URL,
      { question: DEMO_QUESTIONS[0].question },
      {
        onEvent: (event) => {
          if (event && typeof event === "object" && "type" in event) {
            events.push(event as QueryStreamEvent);
          }
        },
        onFinish: () => {
          finished = true;
        },
      }
    );
    vi.advanceTimersByTime(400);
    const seen = events.length;
    controller.abort();
    vi.advanceTimersByTime(60_000);

    expect(events.length).toBe(seen);
    expect(finished).toBe(false);
  });
});

/**
 * The tests above assert on what the fixture *emits*. That is not what the grid
 * *renders*: `demoSseStream` sits under `sseStream`, so its payloads are the RAW
 * backend shape, and `docMatrixStream`'s adapter (lib/api.ts:847-851) derives
 * the typed event from that shape alone — it keys on the presence of a bare
 * `error` field, then `useDocMatrix` keys on `event.type === "error"`
 * (useDocMatrix.ts:288) to render an explanation rather than a claim.
 *
 * So the whole degradation rests on one untyped field name surviving two hops.
 * Move the message to any other key — the natural thing to do when writing what
 * looks like an already-typed error event — and the adapter's `if (raw.error)`
 * misses, no branch of `useDocMatrix` fires, and every cell sits on "Analyzing…"
 * forever: the exact hang this fixture exists to prevent. Verified by mutation:
 * `{type:"error", doc_id, message}` fails both tests below.
 *
 * Driving the real exported caller is what keeps that caught. Same lesson as the
 * findings/overrides envelope in Task 8a — a fixture tested against itself
 * passes while the product renders nothing.
 */
describe("doc-matrix degradation through the real docMatrixStream caller", () => {
  afterEach(() => {
    disableDemoMode();
  });

  it("arrives at the consumer as a typed error event, one per document", async () => {
    enableDemoMode();
    const events: DocMatrixEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      docMatrixStream(
        DEMO_FUND_IV_ID,
        ["doc_a", "doc_b"],
        "Revenue",
        (event) => events.push(event),
        resolve,
        reject
      );
    });

    expect(events).toEqual([
      { type: "error", doc_id: "doc_a", query: "", error: DOC_MATRIX_UNAVAILABLE },
      { type: "error", doc_id: "doc_b", query: "", error: DOC_MATRIX_UNAVAILABLE },
    ]);
  });

  it("lands in the cell as status:error, not as an answer", async () => {
    enableDemoMode();
    const events: DocMatrixEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      docMatrixStream(DEMO_FUND_IV_ID, ["doc_a"], "Revenue", (e) => events.push(e), resolve, reject);
    });

    // Mirrors useDocMatrix.ts:288-293 — the only branch that renders an
    // explanation rather than a claim. `status` is what DocMatrixCell styles
    // on, so an event that misses this branch leaves the cell loading forever.
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type !== "error") throw new Error("unreachable");
    expect(events[0].error).toBe(DOC_MATRIX_UNAVAILABLE);
  });
});
