#!/usr/bin/env node
// For every ticket-only run in evidence/stronger/ (bin/run.mjs --brief
// ticket): were the agent's own tests green on the code it submitted? The
// run's diff.patch is applied to a fresh template (its src/ and tests/own/),
// built, and `node sandbox/test.mjs tests/own` run, 256 MB heap, 2 minutes.
// No model. Writes evidence/stronger/own-green.json, read beside
// results.jsonl: "own tests green, hidden suite rejects" per model.
//
//   node evidence/stronger/own-green.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dirname;
process.env.BOUNCER_HOME = HERE;
const { RUNS, discard, stage, workdir } = await import("../../bin/lib.mjs");

const results = readFileSync(join(HERE, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const rows = [];
for (const row of results.filter((item) => item.variant.startsWith("ticket-") && !item.variant.startsWith("ticket-public-"))) {
  const out = join(RUNS, row.spec, row.variant, String(row.run));
  const patch = join(out, "diff.patch");
  if (!existsSync(patch)) continue;
  const dir = stage(workdir(`own-${row.spec}-${row.variant}-${row.run}`), row.spec, { spec: false, skeleton: true });
  let green = null;
  let tests = 0;
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const applied = spawnSync("git", ["apply", "--include=src/*", "--include=tests/own/*", "--whitespace=nowarn", patch], { cwd: dir, encoding: "utf8" });
    const own = existsSync(join(dir, "tests", "own"));
    if (applied.status === 0 && own) {
      spawnSync("npm", ["run", "build", "--silent"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
      const run = spawnSync(process.execPath, ["--max-old-space-size=256", "sandbox/test.mjs", "tests/own"], { cwd: dir, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
      const text = `${run.stdout}${run.stderr}`;
      tests = Number(/(?:#|ℹ) tests (\d+)/.exec(text)?.[1] ?? 0);
      green = run.status === 0 && tests > 0;
    }
    rows.push({ spec: row.spec, variant: row.variant, run: row.run, verdict: row.verdict, ownTests: tests, ownGreen: green, applied: applied.status === 0, hasOwn: own });
  } finally {
    discard(dir);
  }
}
const byVariant = {};
for (const row of rows) {
  const v = (byVariant[row.variant] ??= { runs: 0, ownGreen: 0, ownGreenRejected: 0, noOwnTests: 0 });
  v.runs += 1;
  if (row.ownGreen) v.ownGreen += 1;
  if (row.ownGreen && row.verdict !== "passed") v.ownGreenRejected += 1;
  if (!row.hasOwn || row.ownTests === 0) v.noOwnTests += 1;
}
writeFileSync(join(HERE, "own-green.json"), `${JSON.stringify({ at: new Date().toISOString(), byVariant, rows }, null, 2)}\n`);
console.log(JSON.stringify(byVariant, null, 2));
