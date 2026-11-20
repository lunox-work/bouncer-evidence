#!/usr/bin/env node
// Does a second writer on another Claude model catch what the first hidden
// suite let through? RESULTS.md "Red team": Opus 5.5 told to game passed
// every hidden test on gherkin-parse and reverse-diff (20 of 20), and
// Codex's independently written suite failed 17 of those 20. Codex is not
// installed here, so `bouncer second` writes the second suite on claude-cli
// with Sonnet 5.5 for the same two specs (evidence/red-team/specs/, their
// archive reference standing in for a reference session), and the same 20
// submissions are judged again with both suites.
//
//   node evidence/second-writer.mjs
//
// Writes evidence/second-writer.json. Resumable: a second suite already
// written is kept.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const HOME = join(ROOT, "evidence", "red-team");
const env = { ...process.env, BOUNCER_HOME: HOME, BOUNCER_MAX_SESSIONS: process.env.BOUNCER_MAX_SESSIONS ?? "3", BOUNCER_MIN_FREE: process.env.BOUNCER_MIN_FREE ?? "35" };
const node = (...argv) => spawnSync(process.execPath, argv, { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const audits = readFileSync(join(HOME, "audit.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

const specs = {};
for (const spec of ["gherkin-parse", "reverse-diff"]) {
  if (!existsSync(join(HOME, "specs", `${spec}-second`, "calibration.json"))) {
    const made = node(join(ROOT, "bin", "second.mjs"), spec, "--backend", "claude-cli", "--model", "claude-sonnet-5-5");
    process.stdout.write(made.stdout + made.stderr);
    if (made.status !== 0) process.exit(1);
  }
  const calibration = JSON.parse(readFileSync(join(HOME, "specs", `${spec}-second`, "calibration.json"), "utf8"));
  const runs = [];
  for (let n = 1; n <= 10; n += 1) {
    const src = join(HOME, "runs", spec, "red-team-opus", String(n), "submission", "src");
    const judged = node(join(ROOT, "bin", "judge.mjs"), spec, src, "--plain");
    const head = judged.stdout.split("\n").find((line) => line.startsWith(`${spec}: `)) ?? "";
    const second = /second hidden (\d+)\/(\d+)/.exec(head);
    const hidden = /, hidden (\d+)\/(\d+)/.exec(head);
    const codex = audits.find((line) => line.spec === spec && line.variant === "red-team-opus" && line.kind === "scripted" && Number(line.run) === n);
    runs.push({
      run: n,
      verdict: /: (\w+)\./.exec(head)?.[1] ?? null,
      hidden: hidden ? `${hidden[1]}/${hidden[2]}` : null,
      second: second ? `${second[1]}/${second[2]}` : null,
      secondFails: second ? Number(second[1]) < Number(second[2]) : null,
      codexFails: codex?.second ? codex.second.verdict !== "passed" : null,
    });
    console.log(spec, n, head);
  }
  specs[spec] = { kept: calibration.kept.length, written: calibration.hiddenWritten, writer: calibration.writer, runs };
}
const all = Object.values(specs).flatMap((spec) => spec.runs);
const out = {
  at: new Date().toISOString(),
  about: "the 20 Opus red-team passes on gherkin-parse and reverse-diff judged again with a second hidden suite written by Sonnet 5.5 (bin/second.mjs)",
  secondCatches: all.filter((run) => run.secondFails).length,
  codexCatches: all.filter((run) => run.codexFails).length,
  either: all.filter((run) => run.secondFails || run.codexFails).length,
  runs: all.length,
  specs,
};
writeFileSync(join(ROOT, "evidence", "second-writer.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, specs: undefined }, null, 2));
