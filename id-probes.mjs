#!/usr/bin/env node
// Executed picks for the ID check: does showing what the code actually
// returns help a reader name the wrong pick? evidence/ID.md: from the list
// alone, the blind judge names a wrong pick in 57 of the 75 rejected
// loose-ticket runs, with no false alarm in 306; it misses the rest mostly
// because a pick written in one sentence is too vague to contradict a
// scenario.
//
// Registered before any run (2026-11-20): it helps when a wrong pick is
// named in 62 or more of the 75 runs with at most 3 false alarms (a pick
// judged to disagree with a scenario that passed). Otherwise `bouncer id`
// stays as it is.
//
// Per run, the list is the stored one (evidence/id-blind/<run>.list.json),
// so only the executed output differs:
// 1. Probes: one session (prompts/id-probe.md, Sonnet 5.5) given the ticket,
//    the run's src/ and the list writes one JavaScript call per item.
// 2. Execution, no model: the run's src/ staged on the template
//    (evidence/stronger/specs/, the same seven specs imported), built, and
//    each probe run with the exports in scope, 2 s each, 256 MB heap; the
//    value or thrown error, inspected and cut to 300 characters.
// 3. Judge: the id-blind judge (Opus 5.5) with the same scenarios and the
//    list, each item also showing `ran:` and the output. It still never sees
//    the diff, the grades or which scenarios failed.
//
//   node evidence/id-probes.mjs [--limit <n>]
//
// Resumable: evidence/id-probes/<run>.{probes,judge}.json. Writes
// evidence/id-probes.json.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
process.env.BOUNCER_HOME = join(ROOT, "evidence", "stronger");
const { PROMPTS, RUNS, args, discard, session, stage, workdir } = await import("../bin/lib.mjs");
const { lastJsonBlock } = await import("../bin/id.mjs");
const { scenarios } = await import("../bin/decisions.mjs");

const PROBE_MODEL = "claude-sonnet-5-5";
const JUDGE_MODEL = "claude-opus-5-5";
const ARCHIVE = join(ROOT, "experiments");
const LISTS = join(ROOT, "evidence", "id-blind");
const OUT = join(ROOT, "evidence", "id-probes");
const { options } = args();
mkdirSync(OUT, { recursive: true });

// The id-blind judge's prompt (evidence/id-blind.mjs), with one paragraph added for `ran:`.
const JUDGE_PROMPT = `You are matching a list of questions to test scenarios.

- \`list.md\` is a numbered list of questions a ticket left open, each with
  what one implementation picked. Most items also show \`ran:\`, a call made
  to that implementation and what it returned or threw: that is what the
  code does, more precisely than the sentence.
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
too vague to tell. Where the item shows \`ran:\`, judge by what the call
returned when it bears on the scenario.

Read both files. Do not run anything and do not change any file.

Answer with one JSON block and nothing after it, one entry per scenario:

\`\`\`json
[{ "scenario": "S1", "item": 3, "agrees": false, "why": "..." }, { "scenario": "S2", "item": null, "agrees": null, "why": "..." }]
\`\`\`
`;

const RUNNER = `import * as m from "./src/index.js";
import { inspect } from "node:util";
import { readFileSync } from "node:fs";
const probes = JSON.parse(readFileSync("probes.json", "utf8"));
const names = Object.keys(m);
const AsyncFunction = (async () => {}).constructor;
const out = [];
for (const p of probes) {
  if (!p.probe) { out.push({ item: p.item, actual: null }); continue; }
  try {
    const f = new AsyncFunction(...names, "return (" + p.probe + ");");
    const value = await Promise.race([f(...names.map((n) => m[n])), new Promise((_, no) => setTimeout(() => no(new Error("timed out after 2 s")), 2000))]);
    out.push({ item: p.item, actual: inspect(value, { depth: 4, breakLength: Infinity }).slice(0, 300) });
  } catch (error) {
    out.push({ item: p.item, actual: "throws " + (error?.name ?? "error") + ": " + String(error?.message ?? error).slice(0, 200) });
  }
}
console.log(JSON.stringify(out));
process.exit(0);
`;

const runs = readdirSync(LISTS).filter((name) => name.endsWith(".list.json")).sort().map((name) => name.slice(0, -".list.json".length)).slice(0, options.limit ? Number(options.limit) : undefined);
const results = [];
for (const id of runs) {
  const spec = id.replace(/-\d+$/, "");
  const n = id.slice(spec.length + 1);
  const dir = join(ARCHIVE, "runs", spec, "self-tested-haiku-ticket", n);
  const listed = JSON.parse(readFileSync(join(LISTS, `${id}.list.json`), "utf8"));
  const grade = JSON.parse(readFileSync(join(dir, "grade.json"), "utf8"));
  const failing = new Set((grade.hiddenFailures ?? []).map((f) => f.id.match(/\[([\w-]+)\]/)?.[1]).filter(Boolean));
  try {
    // 1. Probes.
    const probesFile = join(OUT, `${id}.probes.json`);
    if (!existsSync(probesFile)) {
      const work = workdir(`id-probe-${id}`);
      let result;
      try {
        writeFileSync(join(work, "ticket.md"), readFileSync(join(ARCHIVE, "specs", spec, "ticket.md"), "utf8"));
        cpSync(join(dir, "submission", "src"), join(work, "src"), { recursive: true });
        writeFileSync(join(work, "list.json"), JSON.stringify(listed.items.map((item, i) => ({ item: i + 1, question: item.question, picked: item.chose })), null, 2));
        result = await session({ cwd: work, text: readFileSync(join(PROMPTS, "id-probe.md"), "utf8"), transcript: join(RUNS, "_id-probes", `${id}-probe.jsonl`), kind: "generate", model: PROBE_MODEL });
      } finally {
        discard(work);
      }
      const probes = lastJsonBlock(result.finalText);
      if (!Array.isArray(probes)) throw new Error(`no probes (${result.subtype ?? "no result"})`);
      // 2. Execution.
      const tree = stage(workdir(`id-probe-run-${id}`), spec, { spec: false, src: join(dir, "submission", "src") });
      let ran = [];
      try {
        spawnSync("npm", ["run", "build", "--silent"], { cwd: tree, encoding: "utf8", timeout: 120_000 });
        writeFileSync(join(tree, "probes.json"), JSON.stringify(probes));
        writeFileSync(join(tree, "probe-runner.mjs"), RUNNER);
        const exec = spawnSync(process.execPath, ["--max-old-space-size=256", "probe-runner.mjs"], { cwd: tree, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
        ran = JSON.parse(exec.stdout.trim().split("\n").at(-1) || "[]");
      } catch {
        ran = [];
      } finally {
        discard(tree);
      }
      writeFileSync(probesFile, `${JSON.stringify({ run: id, model: PROBE_MODEL, costUsd: result.costUsd ?? null, probes, ran }, null, 2)}\n`);
    }
    const probed = JSON.parse(readFileSync(probesFile, "utf8"));
    // 3. Judge.
    const judgeFile = join(OUT, `${id}.judge.json`);
    if (!existsSync(judgeFile)) {
      const all = scenarios(readFileSync(join(ARCHIVE, "specs", spec, "spec.md"), "utf8"));
      const work = workdir(`id-probe-judge-${id}`);
      let result;
      try {
        const shown = listed.items.map((item, i) => {
          const probe = probed.probes.find((p) => p.item === i + 1)?.probe;
          const actual = probed.ran.find((r) => r.item === i + 1)?.actual;
          return `${i + 1}. ${item.question}\n   picked: ${item.chose}\n${probe && actual ? `   ran: ${probe} → ${actual}\n` : ""}`;
        });
        writeFileSync(join(work, "list.md"), shown.join("\n"));
        writeFileSync(join(work, "scenarios.md"), all.map((s, i) => `S${i + 1}: ${s.title}\n${s.body}`).join("\n"));
        result = await session({ cwd: work, text: JUDGE_PROMPT, transcript: join(RUNS, "_id-probes", `${id}-judge.jsonl`), kind: "generate", model: JUDGE_MODEL });
      } finally {
        discard(work);
      }
      const answer = lastJsonBlock(result.finalText);
      if (!Array.isArray(answer)) throw new Error(`judge gave no answer (${result.subtype ?? "no result"})`);
      const byLabel = Object.fromEntries(answer.map((row) => [String(row.scenario), row]));
      const rows = all.map((s, i) => {
        const row = byLabel[`S${i + 1}`] ?? {};
        const item = Number.isInteger(row.item) ? row.item : null;
        return { key: s.key, item, agrees: item === null || typeof row.agrees !== "boolean" ? null : row.agrees, why: String(row.why ?? ""), failing: failing.has(s.key) };
      });
      writeFileSync(judgeFile, `${JSON.stringify({ run: id, model: JUDGE_MODEL, costUsd: result.costUsd ?? null, rows }, null, 2)}\n`);
    }
    const judged = JSON.parse(readFileSync(judgeFile, "utf8"));
    results.push({ id, probed, judged });
    const executed = probed.ran.filter((r) => r.actual !== null).length;
    console.error(`${id}: ${executed}/${listed.items.length} probes ran; wrong pick on a failure: ${judged.rows.some((r) => r.failing && r.agrees === false) ? "yes" : "no"}`);
  } catch (error) {
    console.error(`${id}: ${error.message}`);
    if (/usage limit|rate limit|\b429\b|overloaded/i.test(error.message)) break;
  }
}

const told = results.flatMap((r) => r.judged.rows.filter((row) => row.item !== null && row.agrees !== null));
const cell = (agrees, failing) => told.filter((row) => row.agrees === agrees && row.failing === failing).length;
const named = results.filter((r) => r.judged.rows.some((row) => row.failing && row.agrees === false)).length;
const before = JSON.parse(readFileSync(join(ROOT, "evidence", "id-blind.json"), "utf8"));
const summary = {
  date: new Date().toLocaleDateString("sv"),
  registered: "helps when a wrong pick is named in >= 62 of 75 runs with <= 3 false alarms",
  runs: results.length,
  probesWritten: results.reduce((sum, r) => sum + r.probed.probes.filter((p) => p.probe).length, 0),
  probesRan: results.reduce((sum, r) => sum + r.probed.ran.filter((x) => x.actual !== null && !/^throws (SyntaxError|ReferenceError|TypeError: \w+ is not a function)/.test(x.actual)).length, 0),
  items: results.reduce((sum, r) => sum + r.judged.rows.length, 0) && results.reduce((sum, r) => sum + r.probed.probes.length, 0),
  runsWithAWrongPickNamed: named,
  before: { runsWithAWrongPickNamed: before.runsWithADisagreeingPickOnAFailingScenario, falseAlarms: before.pointing.disagreesPassed },
  pointing: { disagreesFailed: cell(false, true), disagreesPassed: cell(false, false), agreesFailed: cell(true, true), agreesPassed: cell(true, false) },
  costUsd: { probes: results.reduce((sum, r) => sum + (r.probed.costUsd ?? 0), 0), judge: results.reduce((sum, r) => sum + (r.judged.costUsd ?? 0), 0) },
};
summary.holds = summary.runs === 75 && named >= 62 && summary.pointing.disagreesPassed <= 3;
writeFileSync(join(ROOT, "evidence", "id-probes.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
