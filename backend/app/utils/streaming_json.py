"""
Streaming parser for the proactive sweep response JSON.

The model emits one top-level object {"answers": [{"id": ..., "answer": ...}, ...]}.
We need to fire a callback as soon as each {id, answer} object is fully closed so
the SSE endpoint can emit a per-question "done" event without waiting for the
entire response to finish streaming.

This is a lightweight tracker tailored to that exact shape — it does not try to
be a general-purpose JSON parser. It tolerates the model occasionally wrapping
the response in ```json fences by stripping any leading non-JSON garbage before
the first '{'.
"""
import json
from collections.abc import Callable


class AnswersArrayStreamer:
    """Feed token chunks via .feed(); on_answer is called once per complete
    {id, answer} object inside the top-level "answers" array."""

    def __init__(self, on_answer: Callable[[dict], None]) -> None:
        self.on_answer = on_answer
        self.buf = ""
        self._scan_pos = 0
        self._in_array = False
        self._depth = 0
        self._obj_start = -1
        self._in_string = False
        self._escape_next = False

    def feed(self, token: str) -> None:
        if not token:
            return
        self.buf += token
        i = self._scan_pos
        n = len(self.buf)

        while i < n:
            ch = self.buf[i]

            # Track string state so braces inside strings don't count as object boundaries
            if self._escape_next:
                self._escape_next = False
                i += 1
                continue
            if ch == "\\" and self._in_string:
                self._escape_next = True
                i += 1
                continue
            if ch == '"':
                self._in_string = not self._in_string
                i += 1
                continue
            if self._in_string:
                i += 1
                continue

            if not self._in_array:
                # Look for the opening of the answers array
                if ch == "[":
                    # Heuristic: confirm "answers" appears earlier in the buffer
                    if '"answers"' in self.buf[: i + 1]:
                        self._in_array = True
                i += 1
                continue

            # Inside the array — track {object} boundaries
            if ch == "{":
                if self._depth == 0:
                    self._obj_start = i
                self._depth += 1
            elif ch == "}":
                self._depth -= 1
                if self._depth == 0 and self._obj_start >= 0:
                    raw = self.buf[self._obj_start : i + 1]
                    self._obj_start = -1
                    try:
                        obj = json.loads(raw)
                        if isinstance(obj, dict):
                            self.on_answer(obj)
                    except json.JSONDecodeError:
                        # Drop silently — the SSE endpoint has a backstop that
                        # also re-parses the full buffer at end-of-stream.
                        pass
            elif ch == "]" and self._depth == 0:
                # Array closed; stop scanning further tokens.
                self._in_array = False
            i += 1

        self._scan_pos = i
