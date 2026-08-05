import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryStreamEvent } from "@/lib/api";
import {
  DEMO_PROMPT_CARDS,
  DEMO_QUESTIONS,
  OFF_SCRIPT_ANSWER,
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
    expect(matchDemoQuestion("what about roache")).not.toBeNull();
    expect(matchDemoQuestion("has there been a deficiency letter")).not.toBeNull();
    expect(matchDemoQuestion("do they have a soc 2 report")).not.toBeNull();
    expect(matchDemoQuestion("how are level 3 assets reviewed")).not.toBeNull();
    expect(matchDemoQuestion("what is the fee offset")).not.toBeNull();
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
    const terms = matchDemoQuestion("what is the fee offset");
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
    expect(matchDemoQuestion("what conflicts of interest are disclosed")).toBeNull();
    expect(
      matchDemoQuestion("what conflicts of interest exist with brightwater securities")
    ).toBeNull();
    expect(matchDemoQuestion("are there affiliated service providers")).toBeNull();
    const titles = DEMO_QUESTIONS.map((q) => q.question.toLowerCase()).join(" ");
    expect(titles).not.toContain("conflict");
  });

  it("attaches no citation to a page that does not support its claim", () => {
    const valuation = matchDemoQuestion("how are level 3 assets reviewed");
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
      expect(matchDemoQuestion(asked), asked).not.toBeNull();
    }
  });

  it("falls back on a question that names a fund the run was not recorded against", () => {
    // The dealId gate in demoSseStream covers the workspace you are standing
    // in, not the fund you are asking about. Fund IV's economics are not Fund
    // III's, and the demo ships no Fund III recording.
    expect(matchDemoQuestion("what is the management fee for fund iii")).toBeNull();
    expect(matchDemoQuestion("carried interest in fund iii")).toBeNull();
    expect(matchDemoQuestion("gp commitment for fund iii")).toBeNull();
    expect(matchDemoQuestion("what were the fees in fund ii")).toBeNull();
    expect(matchDemoQuestion("did anyone leave the firm during fund i")).toBeNull();
    // Naming Fund IV, the fund the run was recorded against, still answers.
    expect(matchDemoQuestion("what is the management fee for fund iv")).not.toBeNull();
  });
});

describe("matchDemoQuestion", () => {
  it("matches a canned question verbatim", () => {
    const q = DEMO_QUESTIONS[0];
    expect(matchDemoQuestion(q.question)?.answer).toBe(q.answer);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const q = DEMO_QUESTIONS[0].question;
    expect(matchDemoQuestion(`  ${q.toUpperCase()}  `)).not.toBeNull();
  });

  it("matches through the composer's document-scope prefix", () => {
    const scoped =
      'Focus on these document(s): "brightwater_iv_ddq.pdf".\n\nwhat about roache';
    expect(matchDemoQuestion(scoped)).toBe(matchDemoQuestion("what about roache"));
  });

  it("never lets the document-scope prefix answer a question nobody asked", () => {
    // "brightwater_valuation_policy.pdf" normalizes to the tokens "valuation
    // policy" — an anchor of the Level 3 answer. If the prefix were not
    // stripped, ticking that document would make *any* off-script question in
    // the chat come back as a confident, well-cited valuation answer.
    const scoped =
      'Focus on these document(s): "brightwater_valuation_policy.pdf".\n\n' +
      "who is the fund administrator";
    expect(matchDemoQuestion(scoped)).toBeNull();
  });

  it("returns null for off-script input", () => {
    expect(matchDemoQuestion("what is the weather in Chicago")).toBeNull();
    expect(matchDemoQuestion("")).toBeNull();
    expect(matchDemoQuestion("   ")).toBeNull();
  });

  it("does not answer a question it only shares one broad topic word with", () => {
    // "valuation" alone must not pull in the Level 3 answer: that answer would
    // be confidently wrong here, which is the one failure this demo cannot have.
    expect(matchDemoQuestion("what is the valuation of the largest portfolio company")).toBeNull();
    expect(matchDemoQuestion("how many partners are on the team")).toBeNull();
    expect(matchDemoQuestion("who audits the fund")).toBeNull();
  });

  it("does not match on a substring of a longer word", () => {
    // " mark " must not fire on "marketing"; " sec " must not fire on "second".
    expect(matchDemoQuestion("send me the marketing deck")).toBeNull();
    expect(matchDemoQuestion("what happened in the second quarter")).toBeNull();
  });
});

describe("DEMO_PROMPT_CARDS", () => {
  it("offers one card per question, submitting the question verbatim", () => {
    expect(DEMO_PROMPT_CARDS.length).toBe(DEMO_QUESTIONS.length);
    for (const card of DEMO_PROMPT_CARDS) {
      expect(matchDemoQuestion(card.prompt)).not.toBeNull();
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.blurb.length).toBeGreaterThan(0);
      expect(card.chips.length).toBeGreaterThan(0);
    }
  });

  it("offers the question set in Fund IV only", () => {
    // The run was recorded against Fund IV. A card clicked in a sibling fund
    // could only answer off-script, or worse, cite documents that workspace's
    // context never contains (CLAUDE.md invariant 2).
    expect(demoPromptCardsFor(DEMO_FUND_IV_ID)).toEqual(DEMO_PROMPT_CARDS);
    expect(demoPromptCardsFor(DEMO_FUND_III_ID)).toEqual([]);
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
    const { events, errors } = run(`/api/deals/${DEMO_FUND_IV_ID}/doc-matrix/stream`, {
      query: DEMO_QUESTIONS[0].question,
    });

    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("demo");
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
