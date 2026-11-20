#!/usr/bin/env node
// The ID check's blind pass (PLAN.md phase 2, reach step 1): `bouncer id` on
// every rejected run of the 105 loose-ticket runs, judged by another model
// that never sees the diff, the grades or which scenarios failed.
//
//   node evidence/id-blind.mjs [--lists-only] [--limit <n>]
//
// 1. Lists: for each of the 75 rejected runs in
//    experiments/runs/<spec>/self-tested-haiku-ticket/<n>, one `bouncer id`
//    session (prompts/id.md, ID_MODEL) given the stored ticket.md and
//    diff.patch only. Seconds and cost recorded.
// 2. Judge: one session (JUDGE_MODEL) per run, given the list (questions
//    and the agent's picks) and every scenario of the spec, unlabelled, in
//    spec order. For each scenario it names the item whose answer would
//    settle what the scenario expects, or none, and whether that item's pick
//    agrees with the scenario. It never sees the diff, the grades or which
//    scenarios failed: blind to the outcome, not to the agent's choices.
//
// Two numbers. Coverage: a run counts when any failing scenario is matched
// to an item; the passing scenarios' match rate is printed beside it,
// because a twelve-item list matches most of a small spec either way.
// Pointing (added after the first 12 runs, on a peer's review): over
// matched scenarios, whether "the pick disagrees" predicts "the scenario
// failed". That is the number that says the list points at the decision
// that broke, and the outcome it is scored against is one the judge never
// saw.
// Resumable: each run's list and judgment is a file under evidence/id-blind/.
// Writes evidence/id-blind.json. One session at a time.
//
// The same pass on other runs (PLAN.md phase 2, reach step 2, the ID check
// outside TypeScript): --runs-root <dir> (runs/<spec>/<arm>/<n>),
// --specs-root <dir> (specs/<spec>/ticket.md and spec.md), --arm <variant>,
// --name <name> (evidence/<name>/ and evidence/<name>.json). Rejected means
// a hidden test failed, as above.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, PROMPTS, RUNS, args, discard, session, workdir } from "../bin/lib.mjs";
import { ID_MODEL, itemsOf, lastJsonBlock } from "../bin/id.mjs";
import { scenarios } from "../bin/decisions.mjs";

export const JUDGE_MODEL = "claude-opus-5-5";
const { options } = args();
const ARM = typeof options.arm === "string" ? options.arm : "self-tested-haiku-ticket";
const RUNS_ROOT = typeof options["runs-root"] === "string" ? resolve(options["runs-root"]) : join(ROOT, "experiments", "runs");
const SPECS_ROOT = typeof options["specs-root"] === "string" ? resolve(options["specs-root"]) : join(ROOT, "experiments", "specs");
const NAME = typeof options.name === "string" ? options.name : "id-blind";
const OUT = join(ROOT, "evidence", NAME);

const JUDGE_PROMPT = `You are matching a list of questions to test scenarios.

- \`list.md\` is a numbered list of questions a ticket left open, each with
  what one implementation picked.
- \`scenarios.md\` is the acceptance scenarios for the same feature, S1, S2
  and so on.

For each scenario, decide whether one item on the list asks the question
that scenario settles: if a person answered that item, would the answer fix
what the scenario expects? Match on the question, not on the pick: an item
counts whether its pick agrees with the scenario or not. When several items
fit, name the closest. When none does, say none. Do not guess from wording
alone: the item has to be about the same behaviour.

Then, for a matched item, say whether its pick agrees with what the
scenario expects: \`true\` when the pick does what the scenario says,
\`false\` when it does something else, \`null\` when the pick as written is
too vague to tell.

Read both files. Do not run anything and do not change any file.

Answer with one JSON block and nothing after it, one entry per scenario:

\`\`\`json
[{ "scenario": "S1", "item": 3, "agrees": false, "why": "..." }, { "scenario": "S2", "item": null, "agrees": null, "why": "..." }]
\`\`\`
`;

const lastJson = (text) => lastJsonBlock(text) ?? null;

/** The 75 rejected runs: { spec, n, dir, failing: Set<key> }. */
export function rejectedRuns() {
  const found = [];
  for (const spec of readdirSync(RUNS_ROOT).sort()) {
    const arm = join(RUNS_ROOT, spec, ARM);
    if (spec.endsWith("-change") || !existsSync(arm)) continue;
    for (const n of readdirSync(arm).sort((a, b) => Number(a) - Number(b))) {
      const grade = JSON.parse(readFileSync(join(arm, n, "grade.json"), "utf8"));
      const failing = new Set((grade.hiddenFailures ?? []).map((f) => f.id.match(/\[([\w-]+)\]/)?.[1]).filter(Boolean));
      if (failing.size > 0) found.push({ spec, n: Number(n), dir: join(arm, n), failing });
    }
  }
  return found;
}

async function list(run, file) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const dir = workdir(`id-blind-${run.spec}-${run.n}`);
  const started = Date.now();
  let result;
  try {
    writeFileSync(join(dir, "ticket.md"), readFileSync(join(SPECS_ROOT, run.spec, "ticket.md"), "utf8"));
    writeFileSync(join(dir, "diff.patch"), readFileSync(join(run.dir, "diff.patch"), "utf8"));
    result = await session({ cwd: dir, text: readFileSync(join(PROMPTS, "id.md"), "utf8"), transcript: join(RUNS, "_id-blind", `${run.spec}-${run.n}-list.jsonl`), kind: "generate", model: ID_MODEL });
  } finally {
    discard(dir);
  }
  const items = itemsOf(result.finalText);
  if (items === null) throw new Error(`${run.spec}/${run.n}: no list (${result.subtype ?? "no result"}${result.apiError ? `, ${result.apiError}` : ""})`);
  const record = { run: `${run.spec}/${run.n}`, model: ID_MODEL, seconds: Math.round((Date.now() - started) / 1000), costUsd: result.costUsd ?? null, items };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

async function judge(run, listed, file) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const all = scenarios(readFileSync(join(SPECS_ROOT, run.spec, "spec.md"), "utf8"));
  const dir = workdir(`id-blind-judge-${run.spec}-${run.n}`);
  let result;
  try {
    writeFileSync(join(dir, "list.md"), listed.items.map((item, i) => `${i + 1}. ${item.question}\n   picked: ${item.chose}\n`).join("\n"));
    writeFileSync(join(dir, "scenarios.md"), all.map((s, i) => `S${i + 1}: ${s.title}\n${s.body}`).join("\n"));
    result = await session({ cwd: dir, text: JUDGE_PROMPT, transcript: join(RUNS, "_id-blind", `${run.spec}-${run.n}-judge.jsonl`), kind: "generate", model: JUDGE_MODEL });
  } finally {
    discard(dir);
  }
  const answer = lastJson(result.finalText);
  if (!Array.isArray(answer)) throw new Error(`${run.spec}/${run.n}: judge gave no answer (${result.subtype ?? "no result"})`);
  const byLabel = Object.fromEntries(answer.map((row) => [String(row.scenario), row]));
  const rows = all.map((s, i) => {
    const row = byLabel[`S${i + 1}`] ?? {};
    const item = Number.isInteger(row.item) ? row.item : null;
    return { key: s.key, item, agrees: item === null || typeof row.agrees !== "boolean" ? null : row.agrees, why: String(row.why ?? ""), failing: run.failing.has(s.key) };
  });
  const record = { run: `${run.spec}/${run.n}`, model: JUDGE_MODEL, costUsd: result.costUsd ?? null, rows };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor((sorted.length - 1) / 2)];
};

mkdirSync(OUT, { recursive: true });
const runs = rejectedRuns().slice(0, options.limit ? Number(options.limit) : undefined);
const results = [];
for (const run of runs) {
  const base = join(OUT, `${run.spec}-${run.n}`);
  try {
    const listed = await list(run, `${base}.list.json`);
    const judged = options["lists-only"] !== undefined ? null : await judge(run, listed, `${base}.judge.json`);
    results.push({ run, listed, judged });
    console.error(`${run.spec}/${run.n}: ${listed.items.length} items, ${listed.seconds}s${judged ? `, failing in list ${judged.rows.filter((r) => r.failing && r.item !== null).length}/${judged.rows.filter((r) => r.failing).length}` : ""}`);
  } catch (error) {
    console.error(`${run.spec}/${run.n}: ${error.message}`);
    if (/usage limit|rate limit|\b429\b|overloaded/i.test(error.message)) break;
  }
}

const judged = results.filter((r) => r.judged);
const failingRows = judged.flatMap((r) => r.judged.rows.filter((row) => row.failing));
const passingRows = judged.flatMap((r) => r.judged.rows.filter((row) => !row.failing));
const summary = {
  what: `bouncer id (prompts/id.md, ${ID_MODEL}) on the rejected runs of ${RUNS_ROOT.replace(`${ROOT}/`, "")}/*/${ARM}, the stored ticket.md and diff.patch only; judged by ${JUDGE_MODEL} given the list (questions and the agent's picks) and every scenario unlabelled, never the diff, the grades or which scenarios failed: blind to the outcome, not to the picks`,
  date: new Date().toLocaleDateString("sv"),
  runs: runs.length,
  listed: results.length,
  judged: judged.length,
  runsWithAFailingScenarioInList: judged.filter((r) => r.judged.rows.some((row) => row.failing && row.item !== null)).length,
  failingScenarios: { total: failingRows.length, inList: failingRows.filter((row) => row.item !== null).length },
  passingScenarios: { total: passingRows.length, inList: passingRows.filter((row) => row.item !== null).length },
  pointing: (() => {
    const told = judged.flatMap((r) => r.judged.rows.filter((row) => row.item !== null && row.agrees !== null));
    const cell = (agrees, failing) => told.filter((row) => row.agrees === agrees && row.failing === failing).length;
    const table = { disagreesFailed: cell(false, true), disagreesPassed: cell(false, false), agreesFailed: cell(true, true), agreesPassed: cell(true, false) };
    const n = told.length;
    return { matchedWithAVerdict: n, ...table, accuracy: n === 0 ? null : Number(((table.disagreesFailed + table.agreesPassed) / n).toFixed(3)), failedFlaggedAsDisagree: table.disagreesFailed + table.agreesFailed === 0 ? null : Number((table.disagreesFailed / (table.disagreesFailed + table.agreesFailed)).toFixed(3)) };
  })(),
  runsWithADisagreeingPickOnAFailingScenario: judged.filter((r) => r.judged.rows.some((row) => row.failing && row.agrees === false)).length,
  itemsAtTheCap: results.filter((r) => r.listed.items.length === 12).length,
  medianItems: median(results.map((r) => r.listed.items.length)),
  medianSeconds: median(results.map((r) => r.listed.seconds)),
  medianListCostUsd: median(results.map((r) => r.listed.costUsd)),
  bySpec: Object.fromEntries(
    [...new Set(judged.map((r) => r.run.spec))].map((spec) => {
      const mine = judged.filter((r) => r.run.spec === spec);
      return [spec, { runs: mine.length, inList: mine.filter((r) => r.judged.rows.some((row) => row.failing && row.item !== null)).length }];
    }),
  ),
  misses: judged.filter((r) => !r.judged.rows.some((row) => row.failing && row.item !== null)).map((r) => ({ run: `${r.run.spec}/${r.run.n}`, failing: [...r.run.failing] })),
};
writeFileSync(join(ROOT, "evidence", `${NAME}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
