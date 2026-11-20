#!/usr/bin/env node
// Phase 5's funnel, per change instead of per repository: what `bouncer
// check` meets on the commits people actually make. evidence/fit-funnel.mjs
// asks "is this repository's main package supported", with the package
// picked by hand; this asks, for each recent commit, the question check asks
// first: which package is this change in, and does `fit` take it. The
// package is never picked by a person here: it is bin/check.mjs's own
// `packageOf` on the commit's changed files. Static only, no model, nothing
// installed, no test run.
//
//   node evidence/fit-funnel-commits.mjs [--work <dir>] [--commits <n>] [--only <owner/name>[,...]] [--no-fetch]
//
// For each clone under --work (default $TMPDIR/bouncer-funnel, the clones
// evidence/fit-funnel.mjs made), one at a time:
//
// 1. Deepen the shallow clone in place by --commits + 9 (default 20 + 9), so
//    the last commits have their parents.
// 2. The last --commits non-merge commits from HEAD that have a parent here.
// 3. Each commit's changed files against its parent, then, as check does:
//    no source file (docs, config, lockfiles) | spans packages | only tests
//    | one package and its seam. A spanning change with exactly one package
//    outside examples/, docs/ and the like is counted apart: check refuses
//    it today.
// 4. `fit --no-run` on each package found, once per package, on the clone's
//    HEAD: the static checks do not move from one commit to the next, and a
//    package a commit touched that HEAD no longer has is fit's "unsupported".
//
// Writes evidence/fit-funnel-commits.json. A repository already in it at the
// same HEAD and --commits is kept, so a stopped run resumes.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packageOf, seamOf } from "../bin/check.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "evidence", "fit-funnel-commits.json");
const MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml|setup\.py|setup\.cfg)$/;

/**
 * What check would do with one change: { outcome: "no-source" } |
 * { outcome: "spans", packages } | { outcome: "tests-only", package } |
 * { outcome: "package", package, seam }. `has(path)` says whether a
 * repository-relative file exists at the commit.
 */
export function classify(changed, has) {
  const found = packageOf(changed, has);
  if (found.none) return { outcome: "no-source" };
  if (found.spans) return { outcome: "spans", packages: found.spans };
  const seam = seamOf(changed, found.pkg);
  return seam.length === 0 ? { outcome: "tests-only", package: found.pkg } : { outcome: "package", package: found.pkg, seam };
}

/** Folders that hold a manifest but are not the product: a change in one beside a real package still "spans". */
const ASIDE = /^(?:examples?|docs?|documentation|playground|demos?|benchmarks?|website|scripts?|e2e|integrations?)(?:\/|$)/;
/** The packages of a spanning change that are not examples, docs or the like. */
export const realPackages = (packages) => packages.filter((pkg) => !ASIDE.test(pkg));

/** A reason without its specifics, so counts group: the text before the first ":", ";" or "(". */
export const reasonClass = (reason) =>
  String(reason ?? "")
    .split(/[:;(]/)[0]
    .trim() || "other";

/** Counts over commits: [{ outcome, supported?, reason? }]. */
export function tally(commits) {
  const of = (outcome) => commits.filter((commit) => commit.outcome === outcome);
  const one = of("package");
  const reasons = {};
  for (const commit of one.filter((each) => !each.supported)) reasons[reasonClass(commit.reason)] = (reasons[reasonClass(commit.reason)] ?? 0) + 1;
  const withSource = commits.length - of("no-source").length;
  const supported = one.filter((commit) => commit.supported).length;
  return {
    commits: commits.length,
    noSource: of("no-source").length,
    testsOnly: of("tests-only").length,
    spansPackages: of("spans").length,
    // Of those, the ones with exactly one package outside examples/, docs/ and the like: one real package plus asides.
    spansOnePackagePlusAsides: of("spans").filter((commit) => realPackages(commit.packages).length === 1).length,
    onePackage: one.length,
    staticallySupported: supported,
    // Of the commits that change source at all, the share check could go on with (static stage only).
    shareOfSourceCommits: withSource === 0 ? null : Math.round((supported / withSource) * 1000) / 10,
    reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = (name) => {
    const at = process.argv.indexOf(`--${name}`);
    return at === -1 ? undefined : (process.argv[at + 1] ?? "");
  };
  const work = flag("work") ?? join(tmpdir(), "bouncer-funnel");
  const wanted = Number(flag("commits") ?? 20);
  const only = flag("only") ? new Set(flag("only").split(",")) : null;
  const deepen = !process.argv.includes("--no-fetch");
  if (!existsSync(work)) {
    console.error(`No clones in ${work}. Run evidence/fit-funnel.mjs --static-only first, or pass --work <dir>.`);
    process.exit(1);
  }
  const git = (dir, ...argv) => spawnSync("git", ["-C", dir, ...argv], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const kept = new Map((before?.repositories ?? []).map((row) => [row.repo, row]));
  const rows = [];
  const write = () => {
    const all = rows.flatMap((row) => row.commits);
    const language = (name) => rows.filter((row) => row.language === name).flatMap((row) => row.commits);
    const summary = {
      what: `for each of ${rows.length} popular open-source libraries (the clones of evidence/fit-funnel.mjs), the last ${wanted} non-merge commits on the default branch: the package bin/check.mjs's packageOf finds for the commit's changed files, then \`fit --no-run\` on that package at the clone's HEAD. Static checks only: nothing installed, no suite run, no model. No package was picked by a person.`,
      date: new Date().toLocaleDateString("sv"),
      bouncer: git(ROOT, "rev-parse", "--short", "HEAD").stdout.trim(),
      all: tally(all),
      typescript: tally(language("typescript")),
      python: tally(language("python")),
      repositories: rows,
    };
    writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  };

  for (const folder of readdirSync(work).sort()) {
    const dir = join(work, folder);
    const repo = folder.replace("__", "/");
    if (!existsSync(join(dir, ".git")) || (only && !only.has(repo))) continue;
    const head = git(dir, "rev-parse", "HEAD").stdout.trim();
    const earlier = kept.get(repo);
    if (earlier && earlier.head === head && earlier.wanted === wanted) {
      rows.push(earlier);
      continue;
    }
    let fetched = null;
    if (deepen && Number(git(dir, "rev-list", "--count", "HEAD").stdout.trim() || 0) < wanted + 9) {
      const run = git(dir, "fetch", `--deepen=${wanted + 9}`, "--quiet");
      fetched = run.status === 0 ? "deepened" : `fetch failed: ${(run.stderr || run.error?.message || "").trim().split("\n").at(-1)}`;
    }
    const shas = git(dir, "rev-list", "--no-merges", "-n", String(wanted * 3), "HEAD")
      .stdout.split("\n")
      .filter(Boolean)
      .filter((sha) => git(dir, "rev-parse", "--verify", "--quiet", `${sha}^`).status === 0)
      .slice(0, wanted);
    const fits = new Map();
    const fit = (pkg) => {
      if (!fits.has(pkg)) {
        const run = spawnSync(process.execPath, ["--max-old-space-size=512", join(ROOT, "bin", "fit.mjs"), "--repo", dir, "--package", pkg, "--no-run"], { encoding: "utf8", timeout: 5 * 60 * 1000 });
        const first = (run.stdout ?? "").split("\n").find((line) => /^(supported|unsupported)/.test(line)) ?? "";
        fits.set(pkg, first === "supported" ? { supported: true, reason: null } : { supported: false, reason: first.startsWith("unsupported: ") ? first.slice("unsupported: ".length) : `fit gave no answer: ${`${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").at(-1) ?? ""}`.slice(0, 300) });
      }
      return fits.get(pkg);
    };
    const commits = [];
    for (const sha of shas) {
      const changed = git(dir, "diff", "--name-only", "--no-renames", `${sha}^`, sha).stdout.split("\n").filter(Boolean);
      const manifests = new Set(git(dir, "ls-tree", "-r", "--name-only", sha).stdout.split("\n").filter((path) => MANIFEST.test(path)));
      const found = classify(changed, (path) => manifests.has(path));
      commits.push({ sha: sha.slice(0, 12), files: changed.length, ...found, ...(found.outcome === "package" ? fit(found.package) : {}) });
    }
    const packages = [...new Set(commits.filter((commit) => commit.package !== undefined).map((commit) => commit.package))];
    const language = existsSync(join(dir, packages[0] ?? ".", "package.json")) || (packages.length === 0 && existsSync(join(dir, "package.json"))) ? "typescript" : "python";
    const row = { repo, head, wanted, language, ...(fetched ? { fetched } : {}), ...tally(commits), commits };
    rows.push(row);
    write();
    console.error(`${repo}: ${commits.length} commits; ${row.noSource} no source, ${row.testsOnly} tests only, ${row.spansPackages} span packages, ${row.onePackage} in one package, ${row.staticallySupported} statically supported`);
  }
  const { all, typescript, python } = write();
  console.log(JSON.stringify({ all, typescript, python }, null, 2));
}
