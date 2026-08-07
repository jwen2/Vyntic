/**
 * Single SSE client for the POST streaming endpoints. This is the reader
 * loop that used to be copy-pasted per stream in api.ts: auth header, POST
 * body, `reader → TextDecoder → split("\n\n") → "data: "` parse, malformed
 * events skipped, AbortError swallowed.
 *
 * (The workflow-run stream in workflows.ts stays on EventSource — it's a GET
 * endpoint authenticated by a short-lived query token, not a POST.)
 */
import { ApiError, errorDetailFromText, getAuthToken } from "./api";
import { isDemoMode } from "@/demo/mode";

export interface SseHandlers<T> {
  onEvent: (event: T) => void;
  onFinish?: () => void;
  onError?: (err: Error) => void;
}

export function sseStream<T>(
  url: string,
  body: unknown,
  handlers: SseHandlers<T>
): AbortController {
  const controller = new AbortController();

  if (isDemoMode()) {
    // Dynamic import keeps the chat fixtures out of the module graph for
    // everyone who never opens the demo. The AbortController has to be returned
    // synchronously, so the fixture stream is wired once the import resolves and
    // an abort that beats it simply stops it from starting.
    void import("@/demo/fixtures/chat")
      .then(({ demoSseStream }) => {
        if (controller.signal.aborted) return;
        const inner = demoSseStream(url, body, {
          // `event` is unknown here, exactly as the parsed payload is on the
          // live path below — this is the same boundary cast, not a new one.
          onEvent: (event) => handlers.onEvent(event as T),
          onFinish: handlers.onFinish,
          onError: handlers.onError,
        });
        controller.signal.addEventListener("abort", () => inner.abort());
      })
      .catch((err: unknown) => {
        // A stale deploy or a blocked chunk rejects this import. Without a
        // handler the rejection goes nowhere and the caller's spinner runs
        // forever, which reads as a hung model rather than a failed fetch.
        if (controller.signal.aborted) return;
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    return controller;
  }

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        handlers.onError?.(
          new ApiError(res.status, errorDetailFromText(await res.text(), res.status))
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const trimmed = chunk.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            handlers.onEvent(JSON.parse(trimmed.slice(6)) as T);
          } catch {
            // skip malformed
          }
        }
      }

      handlers.onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.(err as Error);
      }
    }
  })();

  return controller;
}
