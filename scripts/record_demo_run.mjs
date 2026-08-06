/**
 * Records a real built-in workflow run against the seeded Brightwater Fund IV
 * corpus and writes the completed run to the demo fixtures directory.
 *
 * Polls GET /runs/{id} rather than subscribing to SSE — simpler and just as
 * accurate, since we only want the terminal state.
 *
 * Runs the workflow ONE-CLICK: `synthesis_questions` is left empty so the
 * backend defaults to a single row labelled with the workflow name
 * (routes_workflow_runs.py:116-120). That is the shape the built-in synthesis
 * templates are designed for.
 *
 * Supplying custom rows was tried twice and is a trap. For
 * row_source="multi_doc_synthesis" the backend feeds each row_key to the model
 * AS THE QUESTION (workflow_run_executor.py:298). Entity-name rows give the
 * model nothing to answer; and rows that name a document subset ("What do the
 * LPA, PPM and Form ADV show…") are worse still — they push the model to answer
 * from documents that may not cover the column's topic, producing uncited prose
 * that extraction_engine.py:78-79 then correctly discards, leaving blank cells.
 *
 * Usage:
 *   node scripts/record_demo_run.mjs <admin-email> <admin-password> [workflow-name]
 */
import { writeFileSync } from "node:fs";

// Default to 127.0.0.1 rather than localhost to avoid IPv6 resolution issues
// on some Windows setups.
const BASE = process.env.VYNTIC_API || "http://127.0.0.1:8000";
const argv = process.argv.slice(2);
const CATALOGUE_MODE = argv.includes("--catalogue");
const [email, password, workflowName = "DDQ Gap & Consistency Scan"] = argv.filter(
  (a) => a !== "--catalogue"
);
const DEAL_ID = "brightwater_iv";
const CATALOGUE_OUT = "frontend/src/demo/fixtures/recorded-workflows.json";

const OUTPUTS = {
  "DDQ Gap & Consistency Scan": "frontend/src/demo/fixtures/recorded-ddq-scan-run.json",
  "ODD Screen": "frontend/src/demo/fixtures/recorded-odd-run.json",
};

if (!email || !password) {
  console.error(
    "usage: node scripts/record_demo_run.mjs <email> <password> [workflow-name]\n" +
      "       node scripts/record_demo_run.mjs <email> <password> --catalogue"
  );
  process.exit(1);
}

const out = CATALOGUE_MODE ? CATALOGUE_OUT : OUTPUTS[workflowName];
if (!out) {
  console.error(`no output path configured for workflow "${workflowName}"`);
  process.exit(1);
}

async function api(path, init = {}, token) {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

const { access_token: token } = await api("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});

const workflows = await api(`/deals/${DEAL_ID}/workflows`, {}, token);

if (CATALOGUE_MODE) {
  // Both demo funds are entity_type="fund", so workflow_store.py:87-94 serves
  // them the same eight built-ins — one dump covers both workspaces.
  const builtins = workflows.filter((w) => w.is_builtin);
  if (builtins.length !== 8)
    throw new Error(
      `expected 8 built-in fund workflows, got ${builtins.length} — ` +
        `workflow_seed_lp.py changed, or the DB is not reconciled`
    );
  writeFileSync(out, JSON.stringify(builtins, null, 2));
  console.log(`wrote ${out} — ${builtins.length} templates`);
  process.exit(0);
}

const workflow = workflows.find((w) => w.name === workflowName);
if (!workflow)
  throw new Error(`"${workflowName}" template not found — is workflow_seed_lp reconciled?`);
console.log(`${workflowName}: ${workflow.id} (${workflow.columns.length} columns)`);

const docs = await api(`/deals/${DEAL_ID}/documents`, {}, token);
console.log(`documents in context: ${docs.length}`);

let run = await api(
  `/deals/${DEAL_ID}/workflows/${workflow.id}/runs`,
  {
    method: "POST",
    body: JSON.stringify({
      document_ids: docs.map((d) => d.doc_id),
      // One-click: no synthesis_questions, so the backend creates a single row
      // labelled with the workflow name.
      synthesis_questions: [],
    }),
  },
  token
);
console.log(`run started: ${run.id}`);

const expected = workflow.columns.length;
while (run.status === "running" || run.status === "pending") {
  await new Promise((r) => setTimeout(r, 5000));
  run = await api(`/runs/${run.id}`, {}, token);
  const done = run.cells.filter((c) => c.status === "complete" || c.status === "error").length;
  console.log(`  ${run.status}: ${done}/${expected} cells`);
}

const errored = run.cells.filter((c) => c.status === "error");
if (errored.length) {
  console.warn(`WARNING: ${errored.length} cells errored — retry them in the UI before recording`);
}

writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`wrote ${out} — ${run.cells.length} cells, status ${run.status}`);
