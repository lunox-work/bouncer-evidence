#!/usr/bin/env node
// The gate registered in evidence/second-referee.md: on HumanEval+, each
// solution Claude's suites pass and Codex's suites reject goes to the blind
// referee, one failing Codex test at a time (most solutions reached first),
// until one is ruled `yes` or none is left. Rejected when any is `yes`.
//
//   node evidence/second-referee.mjs cases    # no model: the 14 solutions' failing tests
//   node evidence/second-referee.mjs referee  # referee sessions, one at a time
//   node evidence/second-referee.mjs report   # writes evidence/second-referee.json
//
// Solutions come from the archive's EvalPlus cache
// (~/.cache/double-blind/evalplus, bin/evalplus-import.py in the archive), in
// the order evidence/evalplus.mjs scored them; the stored verdicts are
// experiments/runs/_evalplus (Claude) and evidence/backends/runs/_evalplus
// (Codex). Tests the reference fails are left out, as calibration does.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKENDS = join(ROOT, "evidence", "backends");
const OUT = join(ROOT, "evidence", "second-referee");
const CACHE = join(homedir(), ".cache", "double-blind", "evalplus");
const EXCLUDED = ["he-22", "he-60"];
const MODEL = "claude-fable-5-1";
process.env.BOUNCER_HOME = BACKENDS;
process.env.BOUNCER_SPECS = join(BACKENDS, "specs");
mkdirSync(OUT, { recursive: true });
const casesFile = join(OUT, "cases.jsonl");
const solutionsFile = join(OUT, "solutions.json");
const specOut = join(OUT, "spec.jsonl");
const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
const stored = (dir) => Object.fromEntries(readdirSync(dir).filter((name) => /^he-\d+\.json$/.test(name)).map((name) => [name.slice(0, -5), JSON.parse(readFileSync(join(dir, name), "utf8"))]));
const mode = process.argv[2];

/** evidence/evalplus.mjs `solutions`: every released solution of a task, in its scoring order. */
function solutionsOf(task) {
  const out = [];
  for (const set of readdirSync(join(CACHE, "samples")).sort()) {
    const file = join(CACHE, "samples", set, "eval_results.json");
    if (!existsSync(file)) continue;
    const results = JSON.parse(readFileSync(file, "utf8"));
    for (const row of results?.eval?.[task] ?? []) out.push({ set, solution: row.solution });
  }
  return out;
}

if (mode === "cases") {
  const { judge, testsOf, readJson } = await import(join(ROOT, "bin", "lib.mjs"));
  const claude = stored(join(ROOT, "experiments", "runs", "_evalplus"));
  const codex = stored(join(BACKENDS, "runs", "_evalplus"));
  const failing = (judged) => [...testsOf(judged.public), ...testsOf(judged.hidden)].filter((test) => !test.ok && !test.skipped);
  const cases = new Map();
  const picked = [];
  const totals = { right: 0, wrong: 0, rightRejectedFirst: 0, wrongAcceptedFirst: 0, rightRejectedBoth: 0, wrongAcceptedBoth: 0 };
  for (const slug of Object.keys(codex).sort()) {
    if (EXCLUDED.includes(slug)) continue;
    const task = readJson(join(BACKENDS, "specs", slug, "problem.json")).task_id;
    const texts = solutionsOf(task);
    const onReference = new Set(failing(judge(slug, join(BACKENDS, "specs", slug, "reference", "src"))).map((test) => test.id));
    codex[slug].rows.forEach((row, i) => {
      const first = claude[slug].rows[i];
      if (first.set !== row.set || texts[i]?.set !== row.set) throw new Error(`${slug}#${i}: rows out of order`);
      const right = row.base && row.plus;
      const passFirst = first.public && first.hidden;
      const passSecond = row.public && row.hidden;
      totals[right ? "right" : "wrong"] += 1;
      if (right && !passFirst) totals.rightRejectedFirst += 1;
      if (!right && passFirst) totals.wrongAcceptedFirst += 1;
      if (right && !(passFirst && passSecond)) totals.rightRejectedBoth += 1;
      if (!right && passFirst && passSecond) totals.wrongAcceptedBoth += 1;
      if (!passFirst || passSecond) return;
      const src = join(OUT, "src", `${slug}-${i}`);
      mkdirSync(src, { recursive: true });
      writeFileSync(join(src, "solution.py"), texts[i].solution);
      const ids = [];
      for (const test of failing(judge(slug, src))) {
        if (onReference.has(test.id)) continue;
        const id = `suite:${slug}:${test.id}`;
        if (!cases.has(id))
          cases.set(id, { id, kind: "suite", spec: slug, suite: test.id.includes("/public/") ? "public" : "hidden", name: test.id.split(" :: ")[1], src, message: test.error?.message ?? "", runs: [], ownGreenRuns: [] });
        cases.get(id).runs.push(`${slug}#${i}`);
        ids.push(id);
      }
      picked.push({ key: `${slug}#${i}`, slug, set: row.set, right, ids });
    });
  }
  writeFileSync(casesFile, [...cases.values()].map((item) => JSON.stringify(item)).join("\n") + "\n");
  writeFileSync(solutionsFile, JSON.stringify({ totals, solutions: picked }, null, 1));
  console.log(JSON.stringify(totals));
  console.log(`${picked.length} solutions the second suite alone rejects (${picked.filter((s) => s.right).length} right), ${cases.size} distinct failing tests; ${picked.filter((s) => s.ids.length === 0).length} fail only tests the reference fails`);
}

if (mode === "referee") {
  const { solutions } = JSON.parse(readFileSync(solutionsFile, "utf8"));
  for (let round = 1; ; round += 1) {
    const ruled = new Map(lines(specOut).map((line) => [line.id, line.requires]));
    const open = solutions.filter((item) => !item.ids.some((id) => ruled.get(id) === "yes") && item.ids.some((id) => !ruled.has(id)));
    if (open.length === 0) break;
    const reach = (id) => open.filter((item) => item.ids.includes(id)).length;
    const picked = new Set();
    for (const item of open) {
      if (item.ids.some((id) => picked.has(id))) continue;
      picked.add(item.ids.filter((id) => !ruled.has(id)).sort((a, b) => reach(b) - reach(a))[0]);
    }
    console.log(`round ${round}: ${open.length} solutions unresolved, ${picked.size} case(s)`);
    const only = join(OUT, "only.txt");
    writeFileSync(only, [...picked].join("\n") + "\n");
    const child = spawnSync(process.execPath, [join(ROOT, "bin", "referee.mjs"), "--cases", casesFile, "--archive", BACKENDS, "--only", only, "--out", specOut, "--model", MODEL, "--concurrency", "1"], { stdio: "inherit" });
    if (child.status === 2) process.exit(2);
    if (![...picked].some((id) => lines(specOut).some((line) => line.id === id))) {
      console.log("no case of this round was recorded; stopping");
      break;
    }
  }
}

if (mode === "report") {
  const { totals, solutions } = JSON.parse(readFileSync(solutionsFile, "utf8"));
  const ruled = new Map(lines(specOut).map((line) => [line.id, line]));
  const rejected = (item) => item.ids.some((id) => ruled.get(id)?.requires === "yes");
  const rightRejected = totals.rightRejectedFirst + solutions.filter((item) => item.right && rejected(item)).length;
  const wrongAccepted = totals.wrongAcceptedFirst - solutions.filter((item) => !item.right && rejected(item)).length;
  const report = {
    at: new Date().toISOString(),
    registered: "evidence/second-referee.md, commit 6834bbd",
    totals,
    withReferee: { rightRejected, wrongAccepted, of: { right: totals.right, wrong: totals.wrong } },
    gate: { rightRejectedAtMost: 4, wrongAcceptedAtMost: 36, holds: rightRejected <= 4 && wrongAccepted <= 36 },
    referee: { model: MODEL, refereed: ruled.size, costUsd: Math.round(100 * [...ruled.values()].reduce((sum, line) => sum + (line.costUsd ?? 0), 0)) / 100 },
    solutions: solutions.map((item) => ({ key: item.key, right: item.right, rejected: rejected(item), rulings: item.ids.filter((id) => ruled.has(id)).map((id) => ({ test: ruled.get(id).name, requires: ruled.get(id).requires, reason: ruled.get(id).reason })) })),
  };
  writeFileSync(join(ROOT, "evidence", "second-referee.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report.withReferee, gate: report.gate, referee: report.referee }));
  for (const item of report.solutions) console.log(item.key, item.right ? "right" : "wrong", item.rejected ? "REJECTED" : "passes", item.rulings.map((r) => r.requires).join(","));
}
