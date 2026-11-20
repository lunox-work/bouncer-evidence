#!/usr/bin/env node
// Agent runs judged by tests nobody here wrote: the maintainers' own tests
// in the real commit of each unjs/ufo and unjs/pathe case (RESULTS.md "In
// repositories not written here"). No model.
//
// Per case: the test files the real commit added or changed are laid over
// base, and over base plus the commit's changes in the allowed paths, and
// the package's suite runs on both. The maintainers' acceptance tests are
// the tests of those files that fail on base and pass on the real commit:
// what the change was for, in its authors' words. Every stored agent run of
// the case (runs/<slug>-confirmed/<variant>/<n>/submission, its changes at
// their repository paths) is laid over base with the same test files on top
// and scored on those tests alone. Variants: `haiku` and `codex-cli` (the
// confirmed spec and its public suite), `haiku-no-public` (the confirmed
// spec alone), `ticket-<model>` (bin/run.mjs --brief ticket: the commit
// subject and the declarations it adds, the agent's own tests, no stub).
//
//   node evidence/maintainer-tests.mjs --cases evidence/in-repo-ufo/cases.json [slug...]
//
// Writes <dir>/maintainer-tests.json for that case set, and prints a table.
// The confirmed specs were confirmed by a session playing the developer,
// shown the real diff: that arm has the author's intent, which a ticket
// alone does not.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const at = process.argv.indexOf("--cases");
if (at === -1) {
  console.error("usage: node evidence/maintainer-tests.mjs --cases <dir>/cases.json [slug...]");
  process.exit(1);
}
const casesFile = resolve(process.argv[at + 1]);
const SET = dirname(casesFile);
process.env.BOUNCER_HOME ??= ROOT;
process.env.BOUNCER_SPECS = join(SET, "specs");
const { RUNS, discard, log, runSuite, stage, testsOf, toolchainOf, workdir } = await import("../bin/lib.mjs");
const only = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith("--") && all[i - 1] !== "--cases");

const git = (cwd, ...argv) => {
  const run = spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`git ${argv.join(" ")} in ${cwd}: ${run.stderr}`);
  return run.stdout;
};
const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const copyTree = (from, to) => spawnSync("cp", ["-R", `${from}/.`, to]);

const cases = JSON.parse(readFileSync(casesFile, "utf8")).filter((item) => only.length === 0 || only.includes(item.slug));
const out = {};
for (const item of cases) {
  const slug = `${item.slug}-confirmed`;
  if (!existsSync(join(SET, "specs", slug, "calibration.json"))) continue;
  const chain = toolchainOf(slug);
  const checkout = resolve(ROOT, chain.repo);
  if (resolve(git(checkout, "rev-parse", "--show-toplevel").trim()) !== checkout) throw new Error(`${checkout} is not its own repository (an empty .git?)`);
  const changed = git(checkout, "diff", "--name-only", chain.base, item.commit).split("\n").filter(Boolean);
  const inPackage = (path) => chain.package === "." || path.startsWith(`${chain.package}/`);
  const testFiles = changed.filter((path) => inPackage(path) && /(^|\/)(test|tests|__tests__)\//.test(path) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(path));
  const allowed = changed.filter((path) => (chain.allowedPaths ?? []).some((prefix) => (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix)));
  const atCommit = (path) => {
    const show = spawnSync("git", ["show", `${item.commit}:${path}`], { cwd: checkout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return show.status === 0 ? show.stdout : null;
  };
  const tests = Object.fromEntries(testFiles.map((path) => [path, atCommit(path)]).filter(([, text]) => text !== null));
  const mine = (id) => Object.keys(tests).some((path) => id.includes(path.replace(`${chain.package}/`, "")));
  /** The suite's outcome on base, plus `files` (repository paths), plus the maintainers' test files. */
  const outcome = (label, lay) => {
    const dir = stage(workdir(`${slug}-maint-${label}`), slug, { spec: false });
    try {
      lay(dir);
      for (const [path, text] of Object.entries(tests)) write(dir, path, text);
      const result = runSuite(dir, "existing", chain);
      return new Map(testsOf(result).filter((test) => mine(test.id)).map((test) => [test.id, test.ok && !test.skipped]));
    } finally {
      discard(dir);
    }
  };
  const onBase = outcome("base", () => {});
  const onCommit = outcome("commit", (dir) => {
    for (const path of allowed) {
      const text = atCommit(path);
      if (text === null) rmSync(join(dir, path), { force: true });
      else write(dir, path, text);
    }
  });
  const acceptance = [...onCommit].filter(([id, ok]) => ok && onBase.get(id) !== true).map(([id]) => id);
  log(item.slug, `${Object.keys(tests).length} maintainer test file(s), ${onCommit.size} tests, ${acceptance.length} fail on base and pass on the commit`);
  const variants = {};
  const runsDir = join(RUNS, slug);
  for (const variant of existsSync(runsDir) ? readdirSync(runsDir).filter((name) => /^(haiku|sonnet|opus|codex-cli|ticket-|haiku-no-public)/.test(name)) : []) {
    const rows = [];
    for (const n of readdirSync(join(runsDir, variant)).filter((name) => /^\d+$/.test(name)).sort((a, b) => a - b)) {
      const submission = join(runsDir, variant, n, "submission");
      if (!existsSync(join(runsDir, variant, n, "run.json"))) continue;
      const scored = outcome(`${variant}-${n}`, (dir) => existsSync(submission) && copyTree(submission, dir));
      const passed = acceptance.filter((id) => scored.get(id) === true).length;
      rows.push({ run: Number(n), passed, of: acceptance.length });
    }
    if (rows.length > 0) variants[variant] = { runs: rows.length, allPass: rows.filter((row) => row.passed === row.of).length, rows };
    if (rows.length > 0) log(item.slug, variant, `${variants[variant].allPass} of ${rows.length} runs pass every acceptance test`);
  }
  out[item.slug] = { commit: item.commit, subject: item.subject, testFiles: Object.keys(tests), acceptance: acceptance.length, acceptanceIds: acceptance, variants };
}

const totals = {};
for (const result of Object.values(out))
  for (const [variant, value] of Object.entries(result.variants)) {
    totals[variant] ??= { runs: 0, allPass: 0, cases: 0 };
    totals[variant].runs += value.runs;
    totals[variant].allPass += value.allPass;
    totals[variant].cases += 1;
  }
const record = { at: new Date().toISOString(), set: SET.replace(`${ROOT}/`, ""), totals, cases: out };
writeFileSync(join(SET, "maintainer-tests.json"), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(totals, null, 2));
