# Spike — Gemini context caching feasibility

**Date:** 2026-07-29
**Question:** Can Vyntic cache the document prefix across repeated LLM calls,
and through which client?
**Feeds:** Plan B of `docs/superpowers/specs/2026-07-29-hybrid-context-strategy-design.md`

## Environment

- langchain-google-genai: 2.0.10
- Model: gemini-3.1-flash-lite

## Q1 — Explicit CachedContent via langchain?

```
cached_content field: True
cache-ish fields: ['cache', 'cached_content']
cache-ish methods: ['_agenerate_with_cache', '_convert_cached_generations', '_generate_with_cache', 'create_cached_content']
```

`ChatGoogleGenerativeAI` exposes a `cached_content` model field (accepts a
cache resource name) and a `create_cached_content` method for creating one.
This is the explicit `CachedContent` API, surfaced through langchain.

Import-time caveat (printed on every import, not just this probe):

```
FutureWarning: All support for the `google.generativeai` package has ended.
It will no longer be receiving updates or bug fixes. Please switch to the
`google.genai` package as soon as possible.
  from google.generativeai.caching import CachedContent  # type: ignore[import]
```

`langchain-google-genai` 2.0.10's caching support is implemented on top of
the **deprecated** `google.generativeai` SDK, not the current `google.genai`
SDK. The feature exists and is reachable today, but it sits on a code path
its own maintainer has stopped updating — see Residual risk.

**Answer:** yes

## Q2 — Implicit prefix caching?

Live probe: two calls with an identical ~4,000-token repeated prefix
(`"Section 3.2. The management fee is 2.0% of commitments. " * 400`) plus a
short system/human wrapper, sent back-to-back through `stream_with_fallback`.

Per-chunk trace (`input`, `output`, `cache_read` are the raw
`usage_metadata` / `input_token_details.cache_read` values on each chunk):

```
call-1 chunk 1: input=7207 output=1  cache_read=0
call-1 chunk 2: input=0    output=19 cache_read=0
call-1 chunk 3: input=0    output=0  cache_read=0
call-1: prompt=7207 completion=20 cached=0

call-2 chunk 1: input=7207 output=1  cache_read=0
call-2 chunk 2: input=0    output=19 cache_read=0
call-2 chunk 3: input=0    output=0  cache_read=4076
call-2: prompt=7207 completion=20 cached=4076
```

Call 2 reports `cached_tokens=4076` out of `prompt_tokens=7207` (56.6% of
the prompt), with no cache handle created or passed anywhere — this is
automatic. `get_last_meta()` and `stream_with_fallback` (`llm.py:181`)
required no changes to observe it; Task 1's wiring of
`input_token_details.cache_read` into `LLMCallMeta.cached_tokens` is what
makes it visible.

**Answer:** yes

## Q3 — Pricing and limits

| | |
|---|---|
| Input / 1M tokens | $0.25 (text/image/video); $0.50 (audio) |
| Cached input / 1M tokens | $0.025 (text/image/video); $0.05 (audio) — 90% off standard input |
| Cache storage / 1M tokens / hour | $1.00 |
| Minimum explicit cache size | not found for `gemini-3.1-flash-lite` specifically (see below) |

Source: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) — accessed 2026-07-29 (input/output/cached/storage prices, "Gemini 3.1 Flash-Lite" row, Standard tier).

On the minimum-cache-size figure: Google's caching docs publish an explicit
per-model minimum-token table, but neither the legacy generateContent
caching page nor the current Interactions API caching page lists a
Flash-Lite row. The table that exists reads:

| Model | Minimum tokens |
|---|---|
| Gemini 3.5 Flash | 4,096 |
| Gemini 3.1 Pro Preview | 4,096 |
| Gemini 2.5 Flash | 2,048 |
| Gemini 2.5 Pro | 2,048 |

Sources: [ai.google.dev/gemini-api/docs/generate-content/caching](https://ai.google.dev/gemini-api/docs/generate-content/caching) and [ai.google.dev/gemini-api/docs/caching](https://ai.google.dev/gemini-api/docs/caching) (Interactions API version, explicit caching unsupported there) — both accessed 2026-07-29. Neither page names `gemini-3.1-flash-lite`. Third-party
sites (not Google) claim 1,024 tokens for 2.5 Flash-Lite; not used here
because it is not sourced from Google and is for a different model
generation — recorded as "not found," per instructions not to guess.

What the live probe does establish empirically: implicit caching fired for
`gemini-3.1-flash-lite` on a call with 7,207 total prompt tokens (Q2). That
lower-bounds nothing precisely — the threshold could be anywhere at or
below 7,207 — but it confirms a threshold at or under that value exists and
is being cleared in Vyntic's realistic prompt sizes.

## Q4 — `cached_tokens` accumulation semantics (carried forward from Task 1)

`cache_read` was non-zero exactly **once** across both calls: on the final
(terminator) chunk of call-2 (chunk 3 of 3), where `input_tokens=0` and
`output_tokens=0` on that same chunk. It was 0 on every other chunk in both
calls, including call-1 entirely.

This differs in *position* from `input_tokens`, which fires on the first
content-bearing chunk (chunk 1) and is 0 thereafter. `cache_read` instead
fired on the last chunk. But in *shape* — a single non-zero occurrence
surrounded by zeros — it matches the fire-once pattern the current
`_apply_usage` code assumes for `input_tokens`. Because `cache_read` was
non-zero on only one chunk in this trace, `if cache_read: meta.cached_tokens
= cache_read` (last-non-zero-wins, current code) and "sum every non-zero
`cache_read` across the stream" (the `output_tokens`-style treatment)
produce the identical result here: 4076.

**This does not fully settle the question.** The response in this probe was
short — 3 chunks, 2 content-bearing — so `cache_read` never got a chance to
appear non-zero on more than one chunk the way `output_tokens` does on every
content chunk of a longer stream. Whether `cache_read` could ever increment
across multiple chunks in a longer response (which would make last-non-zero-
wins under-report) was not observed and is not ruled out by this evidence.

**Answer:** confirmed-as-coded for the one observed cache-hit trace
(current last-non-zero-wins arithmetic is correct here), but the general
accumulation semantics across longer, multi-chunk responses remain
unverified. Plan B should not assume this is settled for responses longer
than the one tested here without a further probe using a response long
enough to produce multiple content chunks after a cache hit.

## Recommendation for Plan B

**Explicit caching via langchain — moderate size, but implicit caching may
make it unnecessary as a first step.**

Both explicit and implicit caching are reachable without a new client:

- Q1 confirms `ChatGoogleGenerativeAI.cached_content` /
  `create_cached_content` exist in the installed langchain version — an
  explicit-cache Plan B threads a cache handle through `get_llm`
  (`llm.py:93`), no second client path, no fallback reimplementation.
- Q2 confirms implicit caching is *already firing* for
  `gemini-3.1-flash-lite`, unprompted, with zero code changes — the
  cheapest possible Plan B is: do nothing to the client, just (a) make the
  document-prefix ordering byte-stable across calls sharing a document so
  cache hits are reliable, and (b) trust the `cached_tokens` measurement
  Task 1 already wired up, subject to the Q4 caveat above.

Given both are viable, size Plan B in two stages rather than committing to
the larger one up front:

1. **Stage 1 (implicit, small):** audit call sites for prefix stability
   (same system/document content, same token order, across calls within a
   caching window) and measure `cached_tokens` in production traffic. No
   `llm.py` change beyond what Task 1 already made.
2. **Stage 2 (explicit, moderate — only if Stage 1's hit rate is
   insufficient):** add `cached_content`/`create_cached_content` wiring to
   `get_llm`, scoped per deal/document. Still inside the existing
   `ChatGoogleGenerativeAI` client — `stream_with_fallback`'s two-tier
   fallback logic does not need to change, since both models continue
   going through the same client class.

**Native `google-genai` SDK is not recommended** — nothing in this spike
required it, and Q1's deprecation warning is a reason to actively avoid
adding a second client path right now, not a reason to pre-empt it. Revisit
only if langchain's caching support is dropped or breaks against a future
Gemini API version, since it depends on the now-frozen `google.generativeai`
package.

## Residual risk

- **`google.generativeai` deprecation.** Explicit caching in
  `langchain-google-genai` 2.0.10 is built on a package Google says will
  receive no further updates or bug fixes. It works today; there's no
  stated sunset date in what this spike could reach, but Plan B work that
  leans on `cached_content` should note this dependency explicitly and
  re-check `langchain-google-genai` release notes for a `google.genai`
  rewrite before investing heavily in Stage 2.
- **Explicit-cache minimum token count for `gemini-3.1-flash-lite`: not
  found.** Google's published minimum-token tables (both the legacy
  generateContent caching page and the Interactions API caching page) omit
  Flash-Lite entirely. Resolvable by either (a) a follow-up spike call that
  attempts `create_cached_content` with a known token count and observes
  the API's accept/reject boundary, or (b) filing/finding a support answer
  from Google. Not attempted here to stay inside the ~10-call budget — the
  implicit-caching probe (Q2) already consumed the two live calls that
  mattered most for the Plan B recommendation.
- **`cached_tokens` accumulation semantics for multi-chunk responses: not
  fully verified.** See Q4 — only a single non-zero `cache_read` occurrence
  was observed, on a short 3-chunk response. Resolvable with a follow-up
  probe using a prompt that provokes a longer streamed answer (many content
  chunks) after a cache hit, watching whether `cache_read` appears non-zero
  on more than one chunk.
- **Implicit-caching threshold not pinned down.** The live probe shows
  caching fired somewhere at or below 7,207 prompt tokens; it does not
  establish the exact minimum for `gemini-3.1-flash-lite`. Not a blocker
  for Plan B sizing (implicit caching's exact threshold matters for tuning,
  not for the yes/no feasibility question this spike answers) but worth
  measuring before Plan B sets prefix-size targets.

## Live API calls made

Two calls total (`call-1`, `call-2` in the Q2 probe). No calls were made for
Q1 (static field/method introspection, no network) or Q3 (documentation
lookups only). Well within the ~10-call budget.
