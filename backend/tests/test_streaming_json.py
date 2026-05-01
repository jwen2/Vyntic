"""Tests for the AnswersArrayStreamer used by the proactive sweep endpoint."""
import json
from app.utils.streaming_json import AnswersArrayStreamer


def feed_in_chunks(streamer, payload, chunk_size=7):
    for i in range(0, len(payload), chunk_size):
        streamer.feed(payload[i : i + chunk_size])


def test_complete_payload_emits_each_answer_once():
    payload = json.dumps({
        "answers": [
            {"id": "q0", "answer": "first"},
            {"id": "q1", "answer": "second"},
            {"id": "q2", "answer": "third"},
        ]
    })
    received = []
    s = AnswersArrayStreamer(received.append)
    feed_in_chunks(s, payload)
    assert [a["id"] for a in received] == ["q0", "q1", "q2"]
    assert [a["answer"] for a in received] == ["first", "second", "third"]


def test_braces_inside_strings_are_ignored():
    payload = json.dumps({
        "answers": [
            {"id": "q0", "answer": "has { and } and \"quoted\" braces"},
            {"id": "q1", "answer": "{nested looking text}"},
        ]
    })
    received = []
    s = AnswersArrayStreamer(received.append)
    feed_in_chunks(s, payload, chunk_size=3)
    assert len(received) == 2
    assert received[0]["answer"] == 'has { and } and "quoted" braces'
    assert received[1]["answer"] == "{nested looking text}"


def test_escaped_quotes_in_answer():
    answer_text = 'A quote: \\"hello\\" and a backslash \\\\.'
    payload = '{"answers":[{"id":"q0","answer":"' + answer_text + '"}]}'
    received = []
    s = AnswersArrayStreamer(received.append)
    feed_in_chunks(s, payload, chunk_size=5)
    assert len(received) == 1
    assert received[0]["id"] == "q0"


def test_emits_on_each_object_close_not_at_end():
    """Verify per-answer callback fires before the full response is buffered."""
    payload_first_two = '{"answers":[{"id":"q0","answer":"a"},{"id":"q1","answer":"b"}'
    received = []
    s = AnswersArrayStreamer(received.append)
    s.feed(payload_first_two)
    # Both inner objects have closed even though the outer array hasn't.
    assert len(received) == 2
    s.feed("]}")
    assert len(received) == 2  # No duplicate emits


def test_handles_markdown_fence_wrapper():
    payload = '```json\n{"answers":[{"id":"q0","answer":"x"}]}\n```'
    received = []
    s = AnswersArrayStreamer(received.append)
    feed_in_chunks(s, payload, chunk_size=4)
    assert len(received) == 1
    assert received[0]["answer"] == "x"


def test_realistic_single_answer_with_markdown_content():
    """An answer whose content includes markdown (newlines, **bold**, [Source N])."""
    answer_md = (
        "**[DEAL-BREAKER] Customer concentration**\\n"
        "Top 3 customers represent **71%** [Source 1] of revenue. "
        "Investigate retention curves before signing."
    )
    payload = '{"answers":[{"id":"q5","answer":"' + answer_md + '"}]}'
    received = []
    s = AnswersArrayStreamer(received.append)
    feed_in_chunks(s, payload, chunk_size=10)
    assert len(received) == 1
    assert "[DEAL-BREAKER]" in received[0]["answer"]
    assert "[Source 1]" in received[0]["answer"]
