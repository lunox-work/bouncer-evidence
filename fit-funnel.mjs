#!/usr/bin/env node
// Phase 5's funnel (PLAN.md "5. More repositories get past fit"): how often
// `bouncer fit` says `supported` on repositories people actually have. No
// model. The sample is 50 popular open-source libraries, which commit no
// lockfile more often than applications do and never need a database or an
// app server in their tests: read the counts as libraries', not apps'.
//
//   node evidence/fit-funnel.mjs [--static-only] [--only <owner/name>[,...]] [--work <dir>]
//
// 50 popular repositories, 25 TypeScript and 25 Python, each with the
// package a change would most likely touch. One at a time:
//
// 1. A shallow clone of the default branch (cached under --work, default
//    $TMPDIR/bouncer-funnel).
// 2. `fit --no-run`: the static checks (manifest, lockfile, package manager,
//    workspaces, TypeScript, runner, test folder; pytest, lockfile, tests).
// 3. For those that pass, `fit` itself: install at that commit and run the
//    existing suite once (lib.mjs `prepareBase`), which adds "does not build
//    on a clean install" and "takes over ten minutes". Only when memory is at
//    least 40% free (memory_pressure). Every node process gets a 1 GB heap
//    and any process past MAX_RSS_MB is killed (CLAUDE.md); a kill, an out of
//    memory or a failed clone is "not measured here" and left out of the
//    denominator, since it is this machine's limit, not fit's answer.
//
// Resumable: each repository's result is a file under evidence/fit-funnel/.
// Writes evidence/fit-funnel.json: supported, and each reason with its count.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, args } from "../bin/lib.mjs";

export const REPOS = [
  // TypeScript: owner/name, the package a change would touch.
  ["colinhacks/zod", "packages/zod"],
  ["sindresorhus/ky", "."],
  ["date-fns/date-fns", "pkgs/core"],
  ["unjs/ofetch", "."],
  ["unjs/defu", "."],
  ["unjs/h3", "."],
  ["vitejs/vite", "packages/vite"],
  ["trpc/trpc", "packages/server"],
  ["TanStack/query", "packages/query-core"],
  ["pmndrs/zustand", "."],
  ["pmndrs/jotai", "."],
  ["statelyai/xstate", "packages/core"],
  ["honojs/hono", "."],
  ["drizzle-team/drizzle-orm", "drizzle-orm"],
  ["axios/axios", "."],
  ["vercel/swr", "."],
  ["reduxjs/redux-toolkit", "packages/toolkit"],
  ["immerjs/immer", "."],
  ["mswjs/msw", "."],
  ["remix-run/react-router", "packages/react-router"],
  ["fastify/fastify", "."],
  ["fabian-hiller/valibot", "library"],
  ["Effect-TS/effect", "packages/effect"],
  ["nanostores/nanostores", "."],
  ["supermacro/neverthrow", "."],
  // Python.
  ["psf/requests", "."],
  ["pallets/flask", "."],
  ["pallets/click", "."],
  ["encode/httpx", "."],
  ["fastapi/fastapi", "."],
  ["pydantic/pydantic", "."],
  ["python-attrs/attrs", "."],
  ["Textualize/rich", "."],
  ["tqdm/tqdm", "."],
  ["pallets/jinja", "."],
  ["aio-libs/aiohttp", "."],
  ["marshmallow-code/marshmallow", "."],
  ["more-itertools/more-itertools", "."],
  ["dateutil/dateutil", "."],
  ["arrow-py/arrow", "."],
  ["pytest-dev/pluggy", "."],
  ["psf/black", "."],
  ["fastapi/typer", "."],
  ["Delgan/loguru", "."],
  ["jd/tenacity", "."],
  ["pallets/werkzeug", "."],
  ["hynek/structlog", "."],
  ["python-attrs/cattrs", "."],
  ["urllib3/urllib3", "."],
  ["pypa/packaging", "."],
];

const MAX_RSS_MB = 1024;
const RUN_TIMEOUT_MS = 20 * 60 * 1000;
const OUT = join(ROOT, "evidence", "fit-funnel");

const memoryFree = () => Number(/(\d+)%/.exec(spawnSync("memory_pressure", { encoding: "utf8" }).stdout.split("\n").filter(Boolean).at(-1) ?? "")?.[1] ?? 100);

/** The reason with its specifics stripped, so counts group: "no lockfile at the repository root; ..." -> "no lockfile". */
export function reasonClass(reason) {
  const text = String(reason ?? "");
  if (/^no .*package\.json/.test(text)) return "no package.json in the package";
  if (/^no lockfile/.test(text)) return "no lockfile";
  if (/^package manager/.test(text)) return "unsupported package manager";
  if (/Plug'n'Play/.test(text)) return "Yarn Plug'n'Play";
  if (/is not one of the workspaces/.test(text)) return "package is not a workspace";
  if (/^no TypeScript/.test(text)) return "no TypeScript";
  if (/^runner outside/.test(text)) return "runner outside vitest, Jest and node:test";
  if (/no test (folder|files)|no test_\*\.py/.test(text)) return "no test files where fit looks";
  if (/tsconfig\.test\.json/.test(text)) return "node:test without a tsconfig.test.json outDir";
  if (/^no pytest/.test(text)) return "no pytest";
  if (/does not build on a clean install/.test(text)) return "existing suite does not build on a clean install";
  if (/minutes, over/.test(text)) return "existing suite over ten minutes";
  if (/killed: memory/.test(text)) return "killed: over the memory cap";
  if (/timed out/.test(text)) return "killed: over twenty minutes";
  return text.split(/[:;(]/)[0].trim() || "other";
}

function clone(repo, dir) {
  if (existsSync(join(dir, ".git"))) return null;
  const run = spawnSync("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${repo}.git`, dir], { encoding: "utf8", timeout: 10 * 60 * 1000 });
  return run.status === 0 ? null : (run.stderr || "clone failed").trim().split("\n").at(-1);
}

/** fit as a child, its tree killed past MAX_RSS_MB or RUN_TIMEOUT_MS. Resolves { status, stdout, killed }. */
function fit(argv) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, "bin", "fit.mjs"), ...argv], { detached: true, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" } });
    let stdout = "";
    let stderr = "";
    let killed = null;
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-20000)));
    const kill = (why) => {
      killed = why;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const watch = setInterval(() => {
      const table = spawnSync("ps", ["-axo", "pgid=,rss="], { encoding: "utf8" }).stdout ?? "";
      const biggest = table
        .split("\n")
        .map((line) => line.trim().split(/\s+/).map(Number))
        .filter(([pgid]) => pgid === child.pid)
        .reduce((max, [, rss]) => Math.max(max, rss), 0);
      if (biggest / 1024 > MAX_RSS_MB) kill(`killed: memory, one process at ${Math.round(biggest / 1024)} MB`);
    }, 3000);
    const timer = setTimeout(() => kill("timed out"), RUN_TIMEOUT_MS);
    child.on("close", (status) => {
      clearInterval(watch);
      clearTimeout(timer);
      done({ status, stdout, killed: killed ?? (/heap out of memory|JavaScript heap|ENOMEM|MemoryError/.test(stdout + stderr) ? "killed: out of memory" : null) });
    });
  });
}

const parse = (stdout) => {
  const first = stdout.split("\n").find((line) => /^(supported|unsupported)/.test(line)) ?? "";
  return { supported: first === "supported", reason: first.startsWith("unsupported: ") ? first.slice("unsupported: ".length) : first === "supported" ? null : stdout.trim().split("\n").at(-1) || "fit gave no answer" };
};

const { options } = args();
const work = typeof options.work === "string" ? options.work : join(tmpdir(), "bouncer-funnel");
mkdirSync(work, { recursive: true });
mkdirSync(OUT, { recursive: true });
const only = typeof options.only === "string" ? new Set(options.only.split(",")) : null;
const rows = [];
for (const [repo, pkg] of REPOS) {
  if (only && !only.has(repo)) continue;
  const file = join(OUT, `${repo.replace("/", "__")}.json`);
  let row = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { repo, package: pkg, language: REPOS.indexOf(REPOS.find(([r]) => r === repo)) < 25 ? "typescript" : "python" };
  const dir = join(work, repo.replace("/", "__"));
  if (row.static === undefined) {
    const failed = clone(repo, dir);
    if (failed) row.static = { supported: false, reason: `clone failed: ${failed}` };
    else {
      row.commit = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
      const result = await fit(["--repo", dir, "--package", pkg, "--no-run"]);
      row.static = parse(result.stdout);
    }
    writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`);
  }
  if (row.static.supported && row.run === undefined && options["static-only"] === undefined) {
    while (memoryFree() < 40) {
      console.error(`${repo}: memory under 40% free, waiting`);
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
    const started = Date.now();
    const result = await fit(["--repo", dir, "--package", pkg]);
    row.run = result.killed ? { supported: false, reason: result.killed } : parse(result.stdout);
    row.run.seconds = Math.round((Date.now() - started) / 1000);
    writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`);
  }
  rows.push(row);
  const final = row.run ?? row.static;
  console.error(`${repo} (${pkg}): ${final.supported ? "supported" : `unsupported: ${final.reason}`}`);
}

const final = (row) => row.run ?? row.static;
const unmeasured = (row) => /^(killed|timed out|clone failed)/.test(final(row).reason ?? "");
const count = (all) => {
  const list = all.filter((row) => !unmeasured(row));
  const reasons = {};
  for (const row of list.filter((r) => !final(r).supported)) reasons[reasonClass(final(row).reason)] = (reasons[reasonClass(final(row).reason)] ?? 0) + 1;
  return { repositories: all.length, notMeasuredHere: all.length - list.length, measured: list.length, supported: list.filter((r) => final(r).supported).length, staticallySupported: list.filter((r) => r.static.supported).length, reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])) };
};
const summary = {
  what: "bouncer fit on 50 popular open-source libraries (25 TypeScript, 25 Python), the package a change would most likely touch, default branch, shallow clone; static checks, then an install and one run of the existing suite for those that pass",
  date: new Date().toLocaleDateString("sv"),
  all: count(rows),
  typescript: count(rows.filter((r) => r.language === "typescript")),
  python: count(rows.filter((r) => r.language === "python")),
  rows: rows.map((r) => ({ repo: r.repo, package: r.package, commit: r.commit, supported: final(r).supported, reason: final(r).reason ?? null, stage: r.run ? "run" : "static", seconds: r.run?.seconds })),
};
writeFileSync(join(ROOT, "evidence", "fit-funnel.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ all: summary.all, typescript: summary.typescript, python: summary.python }, null, 2));
