/**
 * Tests for Phase 1, Feature 1: Streaming API client.
 * Tests SSE event parsing and stream lifecycle.
 */
import {
  StreamEvent,
  StreamTokenEvent,
  StreamDoneEvent,
  StreamErrorEvent,
} from "../lib/api";

/** Simulate parsing SSE text into events (mirrors matrixCompareStream logic) */
function parseSSEText(raw: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.startsWith("data: ")) {
      try {
        events.push(JSON.parse(trimmed.slice(6)));
      } catch {
        // skip malformed
      }
    }
  }
  return events;
}

describe("SSE Event Parsing", () => {
  it("parses a single token event", () => {
    const raw = 'data: {"type":"token","deal_id":"d1","query":"q1","token":"Hello"}\n\n';
    const events = parseSSEText(raw);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("token");
    expect((events[0] as StreamTokenEvent).token).toBe("Hello");
  });

  it("parses a done event with citations", () => {
    const raw = 'data: {"type":"done","deal_id":"d1","query":"q1","answer":"Full answer","citations":[{"source_file":"test.pdf","page":1,"text_snippet":"snip"}]}\n\n';
    const events = parseSSEText(raw);
    expect(events).toHaveLength(1);
    const done = events[0] as StreamDoneEvent;
    expect(done.type).toBe("done");
    expect(done.answer).toBe("Full answer");
    expect(done.citations).toHaveLength(1);
    expect(done.citations[0].source_file).toBe("test.pdf");
  });

  it("parses an error event", () => {
    const raw = 'data: {"type":"error","deal_id":"d1","query":"q1","error":"LLM timeout"}\n\n';
    const events = parseSSEText(raw);
    expect(events).toHaveLength(1);
    const err = events[0] as StreamErrorEvent;
    expect(err.type).toBe("error");
    expect(err.error).toBe("LLM timeout");
  });

  it("parses multiple interleaved events", () => {
    const raw = [
      'data: {"type":"token","deal_id":"d1","query":"q1","token":"A"}',
      "",
      'data: {"type":"token","deal_id":"d2","query":"q1","token":"B"}',
      "",
      'data: {"type":"done","deal_id":"d1","query":"q1","answer":"A full","citations":[]}',
      "",
      'data: {"type":"done","deal_id":"d2","query":"q1","answer":"B full","citations":[]}',
      "",
    ].join("\n");

    const events = parseSSEText(raw);
    expect(events).toHaveLength(4);
    expect(events[0].type).toBe("token");
    expect(events[1].type).toBe("token");
    expect(events[2].type).toBe("done");
    expect(events[3].type).toBe("done");
    expect((events[0] as StreamTokenEvent).deal_id).toBe("d1");
    expect((events[1] as StreamTokenEvent).deal_id).toBe("d2");
  });

  it("skips malformed JSON", () => {
    const raw = 'data: {invalid json}\n\ndata: {"type":"token","deal_id":"d1","query":"q1","token":"ok"}\n\n';
    const events = parseSSEText(raw);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("token");
  });

  it("handles empty input", () => {
    const events = parseSSEText("");
    expect(events).toHaveLength(0);
  });

  it("handles events without trailing double newline", () => {
    const raw = 'data: {"type":"token","deal_id":"d1","query":"q1","token":"partial"}';
    const events = parseSSEText(raw);
    // Without \n\n delimiter, the block should still parse if trim handles it
    expect(events).toHaveLength(1);
  });
});

describe("StreamEvent type guards", () => {
  it("token event has correct shape", () => {
    const event: StreamTokenEvent = {
      type: "token",
      deal_id: "deal_1",
      query: "What is revenue?",
      token: "The ",
    };
    expect(event.type).toBe("token");
    expect(event.deal_id).toBeTruthy();
    expect(event.query).toBeTruthy();
    expect(event.token).toBeTruthy();
  });

  it("done event has correct shape", () => {
    const event: StreamDoneEvent = {
      type: "done",
      deal_id: "deal_1",
      query: "What is revenue?",
      answer: "Revenue is $50M",
      citations: [{ source_file: "cim.pdf", page: 3, text_snippet: "snippet" }],
    };
    expect(event.citations).toHaveLength(1);
  });
});
