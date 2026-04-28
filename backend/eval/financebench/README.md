# FinanceBench eval

Runs Patronus AI's [FinanceBench](https://github.com/patronus-ai/financebench) open-source 150-question subset against the Vyntic single-document RAG pipeline (`answer_document_question`). Reports four numbers:

| Metric | What it measures |
|---|---|
| `accuracy` | % of answers an LLM judge labels `CORRECT` vs ground truth |
| `page_hit_exact` | % of questions where ≥1 returned citation page matches the ground-truth evidence page |
| `page_hit_within_1` | same, but within ±1 page (handles 0-vs-1-indexed off-by-ones) |
| `refusal_heuristic_rate` | % of answers matching a refusal phrase (sanity backup against the judge) |

This benchmarks the **retrieval + grounding** plumbing — parser → chunker → embedder → vector store → citation extraction. It does **not** benchmark the workstream playbooks, the Proactive Sweep, or the diligence agent — those need a separate PE-specific eval set.

## One-time setup

```bash
# 1. Clone FinanceBench somewhere outside this project (it ships with PDFs)
git clone https://github.com/patronus-ai/financebench.git ~/datasets/financebench

# 2. Make sure GEMINI_API_KEY is set in backend/.env

# 3. (Optional) Pick a stronger judge model held out of the system under test.
#    Defaults to gemini-3-flash-preview — fine for a smoke test, but a real
#    benchmark should use a stronger model.
export FINANCEBENCH_JUDGE_MODEL=gemini-3-pro-preview
```

## Run

From `backend/`:

```bash
python -m eval.financebench.runner \
  --financebench-dir ~/datasets/financebench \
  --limit 10 \
  --out eval/financebench/results/run-$(date +%Y-%m-%d).jsonl
```

Outputs:

- `<out>` — one JSON line per question (full answer + citations + judge label)
- `<out>.summary.json` — aggregate metrics

## What the runner does

1. Loads N questions from `<fb-dir>/data/financebench_open_source.jsonl`.
2. Ingests each unique source PDF into a single Vyntic deal called `financebench` via the same parser/chunker/embedder used by the API. Re-runs are idempotent — already-ingested filenames are skipped.
3. For each question, calls `answer_document_question(deal_id, doc_id, question)` — the closest analog to FinanceBench's "find the answer in this filing" task.
4. Scores:
   - **Groundedness** — programmatic match between cited page numbers and `evidence_page_num` (exact and ±1)
   - **Accuracy** — LLM-as-judge classifies the answer as `CORRECT` / `INCORRECT` / `REFUSED`
   - **Refusal heuristic** — regex over common refusal phrases as a sanity backup

## Caveats

- **The judge is currently a Gemini model.** For a serious benchmark, set `FINANCEBENCH_JUDGE_MODEL` to a stronger model held out of the pipeline (ideally a different vendor) so it doesn't share blind spots with the system under test.
- **Single-doc retrieval only** — questions whose evidence spans multiple filings will lose recall here. Add a multi-doc variant by swapping `answer_document_question` for `answer_deal_question`.
- **Public 10-Ks ≠ private CIMs.** A high score validates the RAG plumbing, not the PE diligence use case. Pair this with a hand-labeled eval set over `sample_data/` for the use-case dimension.
