import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { sseStream } from "./sse";

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk));
      ctrl.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function collect<T>(url = "/api/test", body: unknown = {}) {
  const events: T[] = [];
  const errors: Error[] = [];
  let finished = false;
  const done = new Promise<void>((resolve) => {
    sseStream<T>(url, body, {
      onEvent: (e) => events.push(e),
      onFinish: () => {
        finished = true;
        resolve();
      },
      onError: (err) => {
        errors.push(err);
        resolve();
      },
    });
  });
  return { events, errors, done, isFinished: () => finished };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sseStream", () => {
  it("parses events split across chunk boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(['data: {"n":', '1}\n\ndata: {"n":2}\n\n', 'data: {"n":3}\n\n'])
      )
    );
    const { events, done, isFinished } = collect<{ n: number }>();
    await done;
    expect(events).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(isFinished()).toBe(true);
  });

  it("skips malformed JSON and non-data lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(['data: {broken\n\n: keepalive\n\ndata: {"ok":true}\n\n'])
      )
    );
    const { events, errors, done } = collect<{ ok: boolean }>();
    await done;
    expect(events).toEqual([{ ok: true }]);
    expect(errors).toEqual([]);
  });

  it("reports non-2xx responses as ApiError with parsed detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('{"detail":"No access to this deal"}'),
      } as unknown as Response)
    );
    const { errors, done } = collect();
    await done;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ApiError);
    expect(errors[0].message).toBe("No access to this deal");
  });

  it("swallows aborts without calling onError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );
    const onError = vi.fn();
    const onEvent = vi.fn();
    const controller = sseStream("/api/test", {}, { onEvent, onError });
    controller.abort();
    // Give the rejected fetch promise a tick to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(onError).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("sends the auth token and JSON body", async () => {
    localStorage.setItem("vyntic_auth_token", "tok-123");
    const fn = vi.fn().mockResolvedValue(streamResponse([]));
    vi.stubGlobal("fetch", fn);
    const { done } = collect("/api/x", { q: "hello" });
    await done;
    const init = fn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-123");
    expect(init.body).toBe('{"q":"hello"}');
    localStorage.clear();
  });
});
