import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryStreamEvent } from "@/lib/api";
import {
  DEMO_PROMPT_CARDS,
  DEMO_QUESTIONS,
  OFF_SCRIPT_ANSWER,
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
    expect(matchDemoQuestion("what conflicts of interest are disclosed")).not.toBeNull();
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
