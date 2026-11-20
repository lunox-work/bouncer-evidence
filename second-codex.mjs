#!/usr/bin/env node
// `bouncer second` as people run it: no --backend, so the writer is Codex
// on the person's Codex login (bin/second.mjs, bin/backends.mjs codex-cli).
// The 17-of-20 and 13-of-13 figures in RESULTS.md came from Codex suites
// the evidence scripts wrote in October (evidence/backends/specs); the
// command's own Codex path had not run (evidence/second-writer.mjs used
// Sonnet, Codex not being installed then). Here it writes a second suite for
// gherkin-parse and reverse-diff into a copy of the red-team specs
// (evidence/second-codex/specs; the stored Sonnet suites are left alone),
// then, with no model, judges:
//
// - the 20 Opus 5.5 red-team passes (told to game; the first suite passed
//   all 20): how many the second suite rejects;
// - the archive's 17 honest public-suite passes on those specs
//   (double-blind-haiku): the 13 that miss a rule the spec requires
//   (evidence/passed-second.json) and the 4 that do not.
//
//   node evidence/second-codex.mjs
//
// Writes evidence/second-codex.json. Resumable: a second suite already
// written is kept.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const HOME = join(ROOT, "evidence", "red-team");
const SPECS = join(ROOT, "evidence", "second-codex", "specs");
const ARCHIVE = join(ROOT, "experiments");
const SPECS_OF = ["gherkin-parse", "reverse-diff"];
const env = { ...process.env, BOUNCER_HOME: HOME, BOUNCER_SPECS: SPECS, BOUNCER_MAX_SESSIONS: "2", BOUNCER_MIN_FREE: "35" };
delete env.BOUNCER_BACKEND;
const node = (...argv) => spawnSync(process.execPath, argv, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = (path) => readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

mkdirSync(SPECS, { recursive: true });
const misses = new Set(
  (JSON.parse(readFileSync(join(ROOT, "evidence", "passed-second", "runs.json"), "utf8")).runs ?? [])
    .filter((run) => SPECS_OF.includes(run.spec) && run.arm === "double-blind-haiku")
    .map((run) => run.key),
);
const ruled = new Map(lines(join(ROOT, "evidence", "passed-second", "spec.jsonl")).map((line) => [line.id, line.requires]));
const requiredMiss = (key) => {
  const run = JSON.parse(readFileSync(join(ROOT, "evidence", "passed-second", "runs.json"), "utf8")).runs.find((item) => item.key === key);
  return run !== undefined && run.ids.some((id) => ruled.get(id) === "yes");
};

/** The second suite's verdict on one submission, from judge's --json record. */
function second(spec, src) {
  const record = join(SPECS, `${spec}-second`, "judged.tmp.json");
  const judged = node(join(ROOT, "bin", "judge.mjs"), `${spec}-second`, src, "--json", record);
  if (!existsSync(record)) throw new Error(`${spec}: no verdict for ${src}\n${judged.stdout}${judged.stderr}`);
  const out = JSON.parse(readFileSync(record, "utf8"));
  rmSync(record);
  return { verdict: out.verdict, hidden: `${out.hidden.passed}/${out.hidden.total}`, failedScenarios: out.failedScenarios };
}

const report = { at: new Date().toISOString(), about: "bouncer second with no --backend (Codex on the person's login), judged on the red-team and honest passes, no model in the judging", specs: {} };
for (const spec of SPECS_OF) {
  if (!existsSync(join(SPECS, spec, "spec.md"))) cpSync(join(HOME, "specs", spec), join(SPECS, spec), { recursive: true });
  if (!existsSync(join(SPECS, `${spec}-second`, "calibration.json"))) {
    const made = node(join(ROOT, "bin", "second.mjs"), spec);
    process.stdout.write(made.stdout + made.stderr);
    if (made.status !== 0) process.exit(1);
  }
  const calibration = JSON.parse(readFileSync(join(SPECS, `${spec}-second`, "calibration.json"), "utf8"));
  const redTeam = [];
  for (let n = 1; n <= 10; n += 1) redTeam.push({ run: n, ...second(spec, join(HOME, "runs", spec, "red-team-opus", String(n), "submission", "src")) });
  const honest = lines(join(ARCHIVE, "results.jsonl"))
    .filter((row) => row.spec === spec && row.variant === "double-blind-haiku" && row.verdict === "passed")
    .map((row) => {
      const key = `${spec}/double-blind-haiku/${row.run}`;
      return { run: row.run, miss: requiredMiss(key), ...second(spec, join(ARCHIVE, "runs", key, "submission", "src")) };
    });
  report.specs[spec] = {
    writer: calibration.writer,
    kept: calibration.kept.length,
    written: calibration.hiddenWritten,
    redTeam: { runs: redTeam.length, rejected: redTeam.filter((item) => item.verdict !== "passed").length, rows: redTeam },
    honest: {
      passes: honest.length,
      misses: honest.filter((item) => item.miss).length,
      missesRejected: honest.filter((item) => item.miss && item.verdict !== "passed").length,
      othersRejected: honest.filter((item) => !item.miss && item.verdict !== "passed").length,
      rows: honest,
    },
  };
  console.log(spec, JSON.stringify({ kept: calibration.kept.length, redTeam: report.specs[spec].redTeam.rejected, honest: { ...report.specs[spec].honest, rows: undefined } }));
}
writeFileSync(join(ROOT, "evidence", "second-codex.json"), `${JSON.stringify(report, null, 2)}\n`);
