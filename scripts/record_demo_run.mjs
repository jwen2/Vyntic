/**
 * Records a real ODD Screen run against the seeded Brightwater Fund IV corpus
 * and writes the completed run to the demo fixtures directory.
 *
 * Polls GET /runs/{id} rather than subscribing to SSE — simpler and just as
 * accurate, since we only want the terminal state.
 *
 * Usage:
 *   node scripts/record_demo_run.mjs <admin-email> <admin-password>
 */
import { writeFileSync } from "node:fs";

// Default to 127.0.0.1 rather than localhost to avoid IPv6 resolution issues
// on some Windows setups.
const BASE = process.env.VYNTIC_API || "http://127.0.0.1:8000";
const [email, password] = process.argv.slice(2);
const DEAL_ID = "brightwater_iv";

const ROWS = [
  "Management company — Brightwater Capital Partners, LLC",
  "Fund vehicle — Brightwater Capital Partners IV, L.P.",
];

if (!email || !password) {
  console.error("usage: node scripts/record_demo_run.mjs <email> <password>");
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
const odd = workflows.find((w) => w.name === "ODD Screen");
if (!odd) throw new Error("ODD Screen template not found — is workflow_seed_lp reconciled?");
console.log(`ODD Screen: ${odd.id} (${odd.columns.length} columns)`);

const docs = await api(`/deals/${DEAL_ID}/documents`, {}, token);
console.log(`documents in context: ${docs.length}`);

let run = await api(
  `/deals/${DEAL_ID}/workflows/${odd.id}/runs`,
  {
    method: "POST",
    body: JSON.stringify({
      document_ids: docs.map((d) => d.doc_id),
      synthesis_questions: ROWS,
    }),
  },
  token
);
console.log(`run started: ${run.id}`);

const expected = ROWS.length * odd.columns.length;
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

const out = "frontend/src/demo/fixtures/recorded-odd-run.json";
writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`wrote ${out} — ${run.cells.length} cells, status ${run.status}`);
