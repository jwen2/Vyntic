# Extraction quality evals

Measures whether answers cite the page that actually contains the fact —
the product promise (CLAUDE.md invariant 6) expressed as a number.

## Running

    python -m evals.run_eval --golden evals/data/<set>.json --docs <dir>

Makes real Gemini calls. Never run from CI.

Do not point this at a database that has already run `init_db` — successful calls will write
real `llm_calls` rows tagged `surface=unknown` that pollute cost measurement.

## Metrics

- `hit_rate` — fraction of questions where some citation landed on an
  expected page. "Did it find the fact?"
- `mean_precision` — fraction of emitted citations that were on target.
  Without this, citing every page would score a perfect hit rate.
- `no_citation_rate` — fraction that produced no citation at all.
  Distinguishes "wrong" from "abstained".

## Building the production golden set

The shipped `example_golden_set.json` proves the harness works. It is not
a quality measurement — the fixture is synthetic and trivially easy.

To build a real set (target: 30–50 questions over 3–4 real documents):

1. Pick documents already ingested in a dev deal — an LPA, a DDQ, a
   quarterly report, and an audited financial statement give good spread.
2. Export each one's `full_text_md` to `evals/data/<name>.md`:

       sqlite3 data/vyntic.db \
         "SELECT full_text_md FROM documents WHERE doc_id='<id>';" \
         > evals/data/<name>.md

3. For each question, read the document and record the page number(s)
   where the answer actually appears. **Page numbers come from the
   `## Page N` headers in the exported markdown**, not the PDF's printed
   page numbers — they differ whenever the PDF has unnumbered front matter.
4. Bias question selection toward the failures that matter: facts that
   are defined in one place and modified in another (a fee set in the LPA
   and waived in a side letter), and facts stated with vocabulary that
   differs from how an analyst would ask.
5. Keep the documents out of git if they contain real client data — add
   `evals/data/*.md` to `.gitignore` and keep the JSON sets, which contain
   only questions and page numbers.
