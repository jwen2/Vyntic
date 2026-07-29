# Doc Matrix — `<think>` tags leak into streaming cells

Found during the DS-Grid branch review (2026-07-29). Not fixed there: that branch
was pure grid chrome, and this is a behaviour change in a streaming path.

## Goal

Stop raw `<think>` reasoning text from rendering into Doc Matrix cells mid-stream,
and either make the "Reasoning…" state reachable or delete it as vestigial.

## The two defects

Both live in `frontend/src/components/docmatrix/DocMatrixCell.tsx`.

**1. `stripThinkTags` (`:11`) cannot strip an in-progress block.**

```ts
text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
```

The pattern requires a closing `</think>`. While the answer is still streaming that
tag hasn't arrived, so `cell.answer = "<think>Let me check the revenue…"` comes back
**unchanged**. `cleanAnswer.length > 0`, the cell takes the streaming branch, and the
model's raw reasoning renders to the user through `AnswerText`.

**2. The "Reasoning…" branch (`:104-107`) is unreachable.**

```tsx
if (cell.status === "loading" && cleanAnswer.length > 0) {
  if (!cleanAnswer) {          // provably false — outer guard proved it non-empty
```

Note fixing this `if` alone changes nothing: even a correct guard could never fire,
because defect 1 means the unterminated block is never stripped in the first place.
The two have to be fixed together.

## Blocking question — settle before writing code

**Do the models actually emit `<think>`?** There is no `<think>` anywhere in
`backend/app`, so nothing server-side generates or wraps it; it would have to come
from the model's own output. `stripThinkTags` existing is evidence someone saw it,
but not proof it still happens.

- If yes → do the fix below.
- If no → the "Reasoning…" state is vestigial; **delete** it and `stripThinkTags`
  rather than resurrecting dead paths.

Check by capturing a real streaming cell's raw `answer` on `acme_saas`.

## Tasks

- [ ] Confirm whether `<think>` appears in streamed `answer` text. If it does not,
      stop and do the deletion variant instead.
- [ ] Extract `stripThinkTags` from the component into `frontend/src/lib/` — it is
      currently private, which is why it has no test coverage.
- [ ] Make it strip an unterminated trailing block. Order matters: complete pairs
      first, then whatever `<think>` is left open at the end of the buffer.
      ```ts
      text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")  // complete blocks
        .replace(/<think>[\s\S]*$/i, "")            // unterminated tail
        .trim()
      ```
- [ ] Tests for it: complete block, unterminated block, multiple blocks, no block,
      and a block spanning a mid-word split (the realistic streaming case).
- [ ] Re-guard the three loading states against the right variables. The current
      split (`cleanAnswer === 0` vs `> 0`) cannot express "raw text arriving,
      nothing showable yet":
      ```tsx
      const rawAnswer = cell?.answer ?? "";

      if (loading && rawAnswer.length === 0)    → "Analyzing…" spinner
      if (loading && cleanAnswer.length === 0)  → "Reasoning…"   (currently dead)
      if (loading)                              → AnswerText + caret
      ```
      The nested `if (!cleanAnswer)` goes away; the third guard collapses to bare
      `status === "loading"`.
- [ ] Verify against a live streaming cell in the browser, light and dark.

## Done when

- No `<think>` text is ever visible in a Doc Matrix cell at any point in a stream.
- All three loading states are reachable, or the unreachable one is gone.
- `stripThinkTags` is tested.

## Out of scope

Tabular Run's streaming path — it does not use `stripThinkTags`. Worth a look while
in here, but do not fold it into this change without measuring it separately.
