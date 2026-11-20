#!/usr/bin/env node
// Phase 4's gate (PLAN.md "4. The verdict people post"), no model:
//
// 1. A card from every stored CI verdict (evidence/ci/records, the 11
//    replayed commits judged from seals, drafted and confirmed: 22 records,
//    with their 22 logs and 22 checks) names no hidden test: no test title
//    from the matching spec's tests/private/ appears in the card, the log or
//    the check body.
// 2. Machine output is unchanged by his voice: `judge --json` and `judge`
//    into a pipe, on the bundled duration-parse example's reference and
//    skeleton, print the same bytes and exit codes as 0.7.0 (a69ab1d, before
//    the voice), apart from the name.
//
//   node evidence/card.mjs
//
// Writes evidence/card.json. Exit 0 when both hold.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card } from "../bin/card.mjs";
import { ROOT, listFiles } from "../bin/lib.mjs";

const CI = join(ROOT, "evidence", "ci");
const SPECS = join(ROOT, "evidence", "in-repo", "specs");
const BEFORE = "a69ab1d";

/** Test titles in a suite folder: the string passed to test(), it() or describe(), 12 characters or longer. */
function titles(dir) {
  const found = new Set();
  let files = [];
  try {
    files = listFiles(dir);
  } catch {
    return found;
  }
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(/\b(?:test|it|describe)(?:\.\w+)?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) if (match[2].length >= 12) found.add(match[2]);
  }
  return found;
}

const leaks = [];
const cards = [];
for (const name of readdirSync(join(CI, "records")).filter((file) => file.endsWith(".json")).sort()) {
  const slug = name.replace(/\.json$/, "");
  const record = JSON.parse(readFileSync(join(CI, "records", name), "utf8"));
  const hidden = titles(join(SPECS, slug, "tests", "private"));
  const svg = card({
    verdict: record.verdict,
    claim: "All tests pass.",
    keys: record.failedScenarios ?? [],
    slug,
    counts: { public: record.public, hidden: record.hidden },
    sha: record.hiddenSha256,
  });
  const texts = { card: svg, log: readFileSync(join(CI, "logs", `${slug}.log`), "utf8"), check: readFileSync(join(CI, "checks", name), "utf8") };
  for (const [kind, text] of Object.entries(texts)) for (const title of hidden) if (text.includes(title)) leaks.push({ slug, kind, title });
  cards.push({ slug, verdict: record.verdict, keys: record.failedScenarios ?? [], hiddenTitles: hidden.size });
}

// 2. Machine output before and after the voice.
const old = mkdtempSync(join(tmpdir(), "bouncer-before-"));
const archive = spawnSync("sh", ["-c", `git -C "${ROOT}" archive ${BEFORE} bin template specs/duration-parse package.json | tar -x -C "${old}"`], { encoding: "utf8" });
if (archive.status !== 0) throw new Error(`git archive ${BEFORE}: ${archive.stderr}`);
const example = join(ROOT, "specs", "duration-parse");
const home = mkdtempSync(join(tmpdir(), "bouncer-card-home-"));
const run = (root, argv) => {
  const child = spawnSync(process.execPath, [join(root, "bin", "judge.mjs"), "duration-parse", ...argv], {
    encoding: "utf8",
    env: { ...process.env, BOUNCER_HOME: home, DUEDILIGENCE_HOME: home, BOUNCER_SPECS: join(ROOT, "specs"), DUEDILIGENCE_SPECS: join(ROOT, "specs"), NO_COLOR: "1" },
    timeout: 300_000,
  });
  // Paths and timings differ between the two trees; the name changed in 0.7.0's rename only.
  const clean = (text) =>
    String(text ?? "")
      .replaceAll(root, "<root>")
      .replace(/\b\d+(?:\.\d+)?\s?(?:ms|s)\b/g, "<t>")
      .replace(/"(?:at|startedAt|finishedAt|judgedAt)":\s*"[^"]*"/g, '"<at>":"<at>"')
      .replace(/duediligence/gi, "bouncer");
  return { status: child.status, stdout: clean(child.stdout) };
};
const machine = [];
for (const [label, src] of [
  ["reference", join(example, "reference", "src")],
  ["skeleton", join(example, "skeleton", "src")],
])
  for (const flags of [["--json"], []]) {
    const before = run(old, [src, ...flags]);
    const after = run(ROOT, [src, ...flags]);
    machine.push({ submission: label, flags: flags.join(" ") || "(pipe)", exit: [before.status, after.status], same: before.status === after.status && before.stdout === after.stdout, ...(before.stdout === after.stdout ? {} : { before: before.stdout.slice(0, 800), after: after.stdout.slice(0, 800) }) });
  }
rmSync(old, { recursive: true, force: true });
rmSync(home, { recursive: true, force: true });

const result = {
  what: "Phase 4's gate: no hidden test title in a card built from any stored CI verdict, nor in its log or check (22 records, 22 logs, 22 checks); judge --json and judge into a pipe print what 0.7.0 printed",
  date: new Date().toLocaleDateString("sv"),
  stored: { records: cards.length, logs: cards.length, checks: cards.length, hiddenTitlesChecked: cards.reduce((sum, c) => sum + c.hiddenTitles, 0) },
  leaks,
  machine,
  holds: leaks.length === 0 && machine.every((row) => row.same),
};
writeFileSync(join(ROOT, "evidence", "card.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, machine: machine.map(({ before, after, ...row }) => row) }, null, 2));
process.exit(result.holds ? 0 : 1);
