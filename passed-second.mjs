#!/usr/bin/env node
// How often is `passed` wrong on honest work (RESULTS.md "When he says
// yes")? The archive measured how often a rejection is right (the referee,
// 95 of 100) but never a pass. Here every stored run that the archive's
// suites (Opus 5.5) passed is judged again by Codex's suites for the same
// spec (evidence/backends/specs: written blind, calibrated on the same
// reference, never seen by the agent), and the distinct tests it fails are
// put to the blind referee (bin/referee.mjs, prompts/referee.md, Fable 5.1)
// in rounds, as evidence/referee-ticket.mjs does. A pass is a real miss when
// any test it fails is one the spec requires; one that fails only tests
// ruled `open` or `no` is the second suite's false reject.
//
//   node evidence/passed-second.mjs audit    # no model: each arm's passes judged by Codex's suites
//   node evidence/passed-second.mjs cases    # no model: the failing calibrated tests per pass
//   node evidence/passed-second.mjs referee  # one referee session at a time, in rounds
//   node evidence/passed-second.mjs codex    # the same tests refereed again by Codex (another model family)
//   node evidence/passed-second.mjs sonnet   # no model: the misses judged by Sonnet's second suites
//   node evidence/passed-second.mjs report   # writes evidence/passed-second.json
//
// Arms: double-blind-haiku (public suite) and double-blind-own-haiku (public
// suite and own tests, the skill's brief), the archive's results.jsonl and
// runs/ (sh scripts/fetch-evidence.sh). A test the reference fails is left
// out: calibration would not have kept it. Resumable: every step reads what
// the one before wrote under evidence/passed-second/; referee transcripts
// go to evidence/red-team/runs/_referee/.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "evidence", "passed-second");
const SECOND = join(ROOT, "evidence", "backends", "specs");
const ARCHIVE = join(ROOT, "experiments");
// The archive's specs are imported here (bin/import-archive.mjs); Sonnet's
// second suites for gherkin-parse and reverse-diff sit beside them.
process.env.BOUNCER_HOME = join(ROOT, "evidence", "red-team");
const ARMS = { "double-blind-haiku": "honest-db.jsonl", "double-blind-own-haiku": "honest-own.jsonl" };
const MODEL = "claude-fable-5-1";
const casesFile = join(OUT, "cases.jsonl");
const runsFile = join(OUT, "runs.json");
const specOut = join(OUT, "spec.jsonl");
const sonnetFile = join(OUT, "sonnet.json");
// The referee is Fable 5.1 and the suites' writers Opus and Codex; `codex`
// asks Codex (bin/referee.mjs --backend codex-cli, the person's login) the
// same question on every test Fable ruled, so a ruling rests on two model
// families. The headline counts a pass as a miss when both say `yes`.
const codexOut = join(OUT, "spec-codex.jsonl");
const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
const mode = process.argv[2];

if (mode === "audit") {
  for (const [arm, file] of Object.entries(ARMS)) {
    const child = spawnSync(
      process.execPath,
      [join(ROOT, "bin", "red-team-audit.mjs"), "--variant", arm, "--from", ARCHIVE, "--second", SECOND, "--out", join(OUT, file), "--concurrency", "2"],
      { stdio: "inherit" },
    );
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
}

if (mode === "cases") {
  process.env.BOUNCER_SPECS = SECOND;
  const { judge, testsOf } = await import(join(ROOT, "bin", "lib.mjs"));
  const failing = (judged) => [...testsOf(judged.public), ...testsOf(judged.hidden)].filter((test) => !test.ok && !test.skipped);
  const onReference = new Map();
  const cases = new Map();
  const runs = [];
  const totals = {};
  for (const [arm, file] of Object.entries(ARMS)) {
    const rows = lines(join(OUT, file)).filter((row) => row.hiddenVerdict === "passed" && row.second?.verdict);
    totals[arm] = { passes: rows.length, bySpec: {} };
    for (const row of rows) {
      const bySpec = (totals[arm].bySpec[row.spec] ??= { passes: 0, failSecond: 0 });
      bySpec.passes += 1;
      if (row.second.verdict === "passed") continue;
      if (!onReference.has(row.spec)) onReference.set(row.spec, new Set(failing(judge(row.spec, join(SECOND, row.spec, "reference", "src"))).map((test) => test.id)));
      const src = join(ARCHIVE, "runs", row.spec, arm, String(row.run), "submission", "src");
      const ids = [];
      for (const test of failing(judge(row.spec, src))) {
        if (onReference.get(row.spec).has(test.id)) continue;
        const id = `suite:${row.spec}:${test.id}`;
        if (!cases.has(id))
          cases.set(id, { id, kind: "suite", spec: row.spec, suite: test.id.startsWith("tests/public/") ? "public" : "hidden", name: test.id.split(" :: ")[1], src, message: test.error?.message ?? "", runs: [], ownGreenRuns: [] });
        cases.get(id).runs.push(`${arm}/${row.run}`);
        ids.push(id);
      }
      if (ids.length === 0) continue;
      bySpec.failSecond += 1;
      runs.push({ key: `${row.spec}/${arm}/${row.run}`, spec: row.spec, arm, run: row.run, ids });
    }
  }
  writeFileSync(casesFile, [...cases.values()].map((item) => JSON.stringify(item)).join("\n") + "\n");
  writeFileSync(runsFile, JSON.stringify({ totals, runs }, null, 1));
  console.log(`${runs.length} passes fail a calibrated test of Codex's suites; ${cases.size} distinct tests`);
}

if (mode === "referee") {
  const { runs } = JSON.parse(readFileSync(runsFile, "utf8"));
  for (let round = 1; ; round += 1) {
    const ruled = new Map(lines(specOut).map((line) => [line.id, line.requires]));
    const open = runs.filter((run) => !run.ids.some((id) => ruled.get(id) === "yes") && run.ids.some((id) => !ruled.has(id)));
    if (open.length === 0) break;
    const reach = (id) => open.filter((run) => run.ids.includes(id)).length;
    const picked = new Set();
    for (const run of open) {
      if (run.ids.some((id) => picked.has(id))) continue;
      picked.add(run.ids.filter((id) => !ruled.has(id)).sort((a, b) => reach(b) - reach(a))[0]);
    }
    console.log(`round ${round}: ${open.length} passes unresolved, ${picked.size} case(s)`);
    const only = join(OUT, "only.txt");
    writeFileSync(only, [...picked].join("\n") + "\n");
    const child = spawnSync(
      process.execPath,
      [join(ROOT, "bin", "referee.mjs"), "--cases", casesFile, "--archive", join(ROOT, "evidence", "backends"), "--only", only, "--out", specOut, "--model", MODEL, "--concurrency", "1"],
      { stdio: "inherit" },
    );
    if (child.status === 2) process.exit(2);
    const after = new Set(lines(specOut).map((line) => line.id));
    if (![...picked].some((id) => after.has(id))) {
      console.log("no case of this round was recorded; stopping");
      break;
    }
  }
}

if (mode === "codex") {
  const only = join(OUT, "only-codex.txt");
  writeFileSync(only, lines(specOut).map((line) => line.id).join("\n") + "\n");
  const child = spawnSync(
    process.execPath,
    [join(ROOT, "bin", "referee.mjs"), "--cases", casesFile, "--archive", join(ROOT, "evidence", "backends"), "--only", only, "--out", codexOut, "--backend", "codex-cli", "--concurrency", "1"],
    { stdio: "inherit" },
  );
  process.exit(child.status ?? 1);
}

if (mode === "sonnet") {
  // bin/second.mjs's fallback writer when Codex is not installed. Its suites
  // exist for the two specs of the red team (evidence/second-writer.json).
  const { runs } = JSON.parse(readFileSync(runsFile, "utf8"));
  const record = join(OUT, "sonnet-judged.tmp.json");
  const out = [];
  for (const run of runs.filter((item) => ["gherkin-parse", "reverse-diff"].includes(item.spec))) {
    const child = spawnSync(process.execPath, [join(ROOT, "bin", "judge.mjs"), `${run.spec}-second`, join(ARCHIVE, "runs", run.key, "submission", "src"), "--json", record], { encoding: "utf8" });
    if (!existsSync(record)) throw new Error(`${run.key}: no verdict\n${child.stdout}${child.stderr}`);
    const judged = JSON.parse(readFileSync(record, "utf8"));
    spawnSync("rm", [record]);
    out.push({ key: run.key, sonnetVerdict: judged.verdict, hidden: `${judged.hidden.passed}/${judged.hidden.total}` });
  }
  writeFileSync(sonnetFile, JSON.stringify(out, null, 1));
  console.log(`${out.filter((item) => item.sonnetVerdict !== "passed").length} of ${out.length} caught by Sonnet's second suite`);
}

if (mode === "report") {
  const { totals, runs } = JSON.parse(readFileSync(runsFile, "utf8"));
  const ruled = new Map(lines(specOut).map((line) => [line.id, line]));
  const classOf = (run) => (run.ids.some((id) => ruled.get(id)?.requires === "yes") ? "required" : run.ids.every((id) => ruled.has(id)) ? "open" : "unresolved");
  const mutants = new Map(lines(join(ARCHIVE, "mutation.jsonl")).map((row) => [row.spec, Math.round((1000 * (row.judged - row.eitherKilled)) / row.judged) / 10]));
  const sonnet = existsSync(sonnetFile) ? JSON.parse(readFileSync(sonnetFile, "utf8")) : [];
  const codex = new Map(lines(codexOut).map((line) => [line.id, line]));
  const yes = (map) => (run) => run.ids.some((id) => map.get(id)?.requires === "yes");
  const bothYes = (run) => run.ids.some((id) => ruled.get(id)?.requires === "yes" && codex.get(id)?.requires === "yes");
  const arms = {};
  for (const [arm, total] of Object.entries(totals)) {
    const mine = runs.filter((run) => run.arm === arm);
    const count = (list, name) => list.filter((run) => classOf(run) === name).length;
    const bySpec = {};
    for (const [spec, by] of Object.entries(total.bySpec)) {
      const of = mine.filter((run) => run.spec === spec);
      bySpec[spec] = { passes: by.passes, required: count(of, "required"), open: count(of, "open"), mutantSurvivalPct: mutants.get(spec) ?? null };
    }
    const byCodex = codex.size === 0 ? null : { required: mine.filter(yes(codex)).length, bothRequired: mine.filter(bothYes).length };
    arms[arm] = { passes: total.passes, failSecond: mine.length, required: count(mine, "required"), open: count(mine, "open"), unresolved: count(mine, "unresolved"), codexReferee: byCodex, bySpec };
  }
  const misses = (spec) => runs.filter((run) => run.spec === spec && classOf(run) === "required").map((run) => run.key);
  const sonnetMisses = sonnet.filter((item) => ["gherkin-parse", "reverse-diff"].some((spec) => misses(spec).includes(item.key)));
  const report = {
    at: new Date().toISOString(),
    about: "every archive run the Opus-written suites passed, judged again by Codex's suites, the failing calibrated tests refereed blind against the spec",
    referee: { model: MODEL, refereed: ruled.size, requires: [...ruled.values()].reduce((acc, line) => ({ ...acc, [line.requires]: (acc[line.requires] ?? 0) + 1 }), {}), costUsd: Math.round(100 * [...ruled.values()].reduce((sum, line) => sum + (line.costUsd ?? 0), 0)) / 100 },
    arms,
    codexReferee:
      codex.size === 0
        ? null
        : {
            refereed: codex.size,
            agree: [...ruled.keys()].filter((id) => codex.get(id)?.requires === ruled.get(id).requires).length,
            requires: [...codex.values()].reduce((acc, line) => ({ ...acc, [line.requires]: (acc[line.requires] ?? 0) + 1 }), {}),
            disagreements: [...ruled.values()]
              .filter((line) => codex.has(line.id) && codex.get(line.id).requires !== line.requires)
              .map((line) => ({ spec: line.spec, name: line.name, passes: line.runs.length, fable: line.requires, codex: codex.get(line.id).requires, codexReason: codex.get(line.id).reason })),
          },
    sonnetSecondSuite: { misses: sonnetMisses.length, caught: sonnetMisses.filter((item) => item.sonnetVerdict !== "passed").length },
    tests: [...ruled.values()].map(({ id, spec, suite, name, requires, severity, reason, runs: of }) => ({ spec, suite, name, requires, codexRequires: codex.get(id)?.requires ?? null, severity, passes: of.length, reason })),
  };
  writeFileSync(join(ROOT, "evidence", "passed-second.json"), JSON.stringify(report, null, 2) + "\n");
  for (const [arm, a] of Object.entries(arms))
    console.log(`${arm}: ${a.passes} passes, ${a.required} miss a required rule, ${a.open} fail only open tests, ${a.unresolved} unresolved${a.codexReferee ? `; Codex referee ${a.codexReferee.required}, both ${a.codexReferee.bothRequired}` : ""}`);
  console.log(`Sonnet's second suite: ${report.sonnetSecondSuite.caught} of ${report.sonnetSecondSuite.misses} misses; referee ${ruled.size} tests, $${report.referee.costUsd}`);
}
