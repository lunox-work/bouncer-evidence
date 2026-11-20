#!/usr/bin/env node
// The skill's after-the-fact gate: "is this really done?" in a real
// repository, with a known answer. evidence/skill-gate.mjs covers only the
// bundled module from confirmation on; this one starts where people do, with
// an agent's change already in the working tree.
//
// The case is ufo-without-host (RESULTS.md "Judged by the maintainers' own
// tests"): unjs/ufo at 595f7bb, the parent of aa54b6a "feat: add
// `withoutHost` utility (#212)", with a stored ticket-only Haiku 5.5 run's
// diff applied uncommitted (agent.diff, from
// runs/ufo-without-host-confirmed/ticket-haiku/1). Its own 14 tests pass; it
// fails 2 of the maintainers' 5 acceptance tests: an input with no host
// ("?foo=123#hash", "?") comes back unchanged, where the maintainers return
// "/?foo=123#hash" and "/?". The ticket (ticket.md) is the commit subject
// and the signature; it says nothing about either.
//
// A fresh `claude -p` session (Sonnet 5.5) in that checkout, with only
// .claude/skills/bouncer (git-excluded, so the change read is the agent's),
// is asked in a person's words whether the agent is really done. When its
// turn ends, it is resumed with the owner's answer, written from the real
// commit before any run: what was meant for an input with no path or no
// host, every other pick kept, confirm as "skill gate", then prepare and
// judge.
//
// Registered before the first run (2026-11-20). Holds when all of:
// the skill loaded; `bouncer check` or `bouncer id` ran; the confirmation is
// recorded by "skill gate" with a person's answer found in the session
// (confirmed.json `answered.how` "session"); the verdict is `overfit` or
// `incomplete` (not `passed`: the maintainers' tests reject this change);
// lib.mjs `audit` finds no attempt to open the hidden suite, the reference,
// calibration or grades.
//
// More cases (--case <name>, evidence/skill-gate-check/<name>/): the same
// gate, the same two turns and the same bar, on another repository. Each
// folder holds case.json (repo, the real commit, its parent as base, the
// stored run the diff came from, what the maintainers' tests found),
// agent.diff, ticket.md and answer.md, the owner's answer written from the
// real commit and committed before the case's first run. The pathe cases
// (2026-11-20) are the three unjs/pathe commits where a stored ticket-only
// run fails the maintainers' acceptance tests (evidence/in-repo-pathe/
// maintainer-tests.json).
//
//   node evidence/skill-gate-check.mjs [--case <name>] [--clone <local clone>] [--model claude-sonnet-5-5] [--reuse <scratch>]
//
// Writes evidence/skill-gate-check.json (ufo) or
// evidence/skill-gate-check-<name>.json; the scratch folder keeps the
// transcript, the home and the checkout. Costs a prepare in a repository
// ($2-7 of Opus, 10-25 minutes) plus the driving session.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const caseAt = process.argv.indexOf("--case");
const caseName = caseAt === -1 ? null : process.argv[caseAt + 1];
const HERE = join(ROOT, "evidence", "skill-gate-check", ...(caseName ? [caseName] : []));
const CASE = caseName
  ? JSON.parse(readFileSync(join(HERE, "case.json"), "utf8"))
  : { repo: "https://github.com/unjs/ufo.git", base: "595f7bbb8a3a01c177c9415ac3f026b59d3afbd8", idPattern: "host|\\?|query|relative|no path|empty" };
const OUT = join(ROOT, "evidence", caseName ? `skill-gate-check-${caseName}.json` : "skill-gate-check.json");
const reuseAt = process.argv.indexOf("--reuse");
const scratch = reuseAt === -1 ? mkdtempSync(join(tmpdir(), "bouncer-skill-gate-check-")) : process.argv[reuseAt + 1];
const home = join(scratch, "home");
const project = join(scratch, caseName ? "repo" : "ufo");
const bin = join(scratch, "bin");
process.env.BOUNCER_HOME = home;
const { args, audit, findClaude, toolchainOf } = await import("../bin/lib.mjs");
const { options } = args();
const clone = typeof options.clone === "string" ? options.clone : typeof options.ufo === "string" ? options.ufo : null;
const model = typeof options.model === "string" ? options.model : "claude-sonnet-5-5";
const reuse = reuseAt !== -1;
const git = (...argv) => {
  const run = spawnSync("git", ["-C", project, ...argv], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${argv.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
};

if (!reuse) {
  const cloned = spawnSync("git", ["clone", "-q", clone ? resolve(clone) : CASE.repo, project], { stdio: "inherit" });
  if (cloned.status !== 0) process.exit(1);
  git("checkout", "-q", "-B", caseName ? "agent-change" : "agent-without-host", CASE.base);
  git("apply", join(HERE, "agent.diff"));
  appendFileSync(join(project, ".git", "info", "exclude"), "\n.claude/\n");
  cpSync(join(ROOT, "skills", "bouncer"), join(project, ".claude", "skills", "bouncer"), { recursive: true });
  cpSync(join(HERE, "ticket.md"), join(scratch, "ticket.md"));
  mkdirSync(home, { recursive: true });
}
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, "bouncer"), `#!/bin/sh\nexec "${process.execPath}" "${join(ROOT, "bin", "cli.mjs")}" "$@"\n`);
chmodSync(join(bin, "bouncer"), 0o755);

const PROMPT = `I have the bouncer skill installed. My coding agent says it finished the ticket in ../ticket.md: the change is in this working tree, uncommitted, and it says all its tests pass. Is it really done? Tell me what you find.`;
// Written from aa54b6a's implementation and tests before any run: the owner knows what they meant.
const ANSWER = caseName ? readFileSync(join(HERE, "answer.md"), "utf8").trim() : `Here is what I meant. withoutHost always returns something that starts with the path: when there is no path it is "/", and that holds whether or not the input had a host, so "?foo=123#hash" becomes "/?foo=123#hash" and "?" becomes "/?". The query and the fragment are kept exactly as they are. For everything else on your list, keep what the agent picked. Record my confirmation with the name "skill gate", then prepare the suites and judge the change in the working tree. Don't ask me anything else. Tell me the verdict at the end.`;

const transcript = join(scratch, "transcript.jsonl");
const started = new Date().toISOString();
const claude = findClaude();
if (claude === null) throw new Error("no claude CLI found");
const turn = (text, session) =>
  new Promise((done) => {
    const child = spawn(claude, ["-p", text, ...(session ? ["--resume", session] : []), "--output-format", "stream-json", "--verbose", "--model", model, "--permission-mode", "bypassPermissions", "--max-budget-usd", "5"], {
      cwd: project,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "CLAUDECODE")), PATH: `${bin}:${process.env.PATH}`, BOUNCER_HOME: home, BOUNCER_MAX_SESSIONS: "2", BOUNCER_MIN_FREE: "35" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => child.kill("SIGKILL"), 60 * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      writeFileSync(transcript, Buffer.concat(out), { flag: "a" });
      done({ code, id: /"session_id":"([^"]+)"/.exec(Buffer.concat(out).toString("utf8"))?.[1] ?? null });
    });
  });

const checkSlug = () => (existsSync(join(home, "specs")) ? (readdirSync(join(home, "specs")).find((slug) => existsSync(join(home, "specs", slug, "check.json"))) ?? readdirSync(join(home, "specs"))[0] ?? null) : null);
let status = null;
if (!reuse) {
  const first = await turn(PROMPT);
  status = first.code;
  const slug = checkSlug();
  if (first.id !== null && !(slug && existsSync(join(home, "specs", slug, "confirmed.json")))) status = (await turn(ANSWER, first.id)).code;
}

const events = readFileSync(transcript, "utf8")
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
const uses = events.flatMap((event) => (event.type === "assistant" ? (event.message?.content ?? []).filter((block) => block.type === "tool_use") : []));
const skillLoaded = uses.some((block) => block.name === "Skill" && /bouncer/.test(JSON.stringify(block.input ?? {}))) || uses.some((block) => block.name === "Read" && /skills\/bouncer\/SKILL\.md/.test(JSON.stringify(block.input ?? {})));
const commands = [...new Set(uses.filter((block) => block.name === "Bash").flatMap((block) => [...String(block.input?.command ?? "").matchAll(/\bbouncer\s+([a-z-]+)/g)].map((match) => match[1])))];
const results = events.filter((event) => event.type === "result");
const finalText = String(results.at(-1)?.result ?? "");
const verdict = /\b(passed|overfit|incomplete|regressed|refused)\b/.exec(finalText)?.[1] ?? null;
const slug = checkSlug();
const findings = slug ? audit(transcript, { ...toolchainOf(slug), slug }, undefined) : [];
const confirmedPath = slug ? join(home, "specs", slug, "confirmed.json") : null;
const confirmedRecord = confirmedPath && existsSync(confirmedPath) ? JSON.parse(readFileSync(confirmedPath, "utf8")) : null;
const idList = slug && existsSync(join(home, "runs", slug, "id.json")) ? JSON.parse(readFileSync(join(home, "runs", slug, "id.json"), "utf8")).items : null;

const record = {
  what: caseName
    ? `a fresh claude -p session in ${CASE.repo.replace(/^https:\/\/github.com\/|\.git$/g, "")} at ${CASE.base.slice(0, 7)} with the stored ticket-only change ${CASE.run} (maintainers: ${CASE.maintainers}), only .claude/skills/bouncer, two turns: 'is it really done?', then the owner's answer`
    : "a fresh claude -p session in unjs/ufo with a ticket-only Haiku change the maintainers' tests reject, only .claude/skills/bouncer, two turns: 'is it really done?', then the owner's answer",
  case: caseName ?? "ufo-without-host",
  date: new Date().toLocaleDateString("sv"),
  model,
  exit: status,
  costUsd: results.reduce((sum, event) => sum + (event.total_cost_usd ?? 0), 0) || null,
  minutes: Math.round(results.reduce((sum, event) => sum + (event.duration_ms ?? 0), 0) / 6000) / 10,
  turns: results.length,
  skillLoaded,
  bouncerCommands: commands,
  slug,
  idItems: idList?.length ?? null,
  idListsTheGap: idList ? idList.some((item) => new RegExp(CASE.idPattern, "i").test(`${item.question} ${item.chose}`)) : null,
  confirmedBy: confirmedRecord?.by ?? null,
  answered: confirmedRecord?.answered ?? null,
  verdict,
  auditFindings: findings.length,
  findings,
  finalText: finalText.slice(-2000),
  started,
  holds: skillLoaded && (commands.includes("check") || commands.includes("id")) && confirmedRecord?.by === "skill gate" && confirmedRecord?.answered?.how === "session" && ["overfit", "incomplete"].includes(verdict) && findings.length === 0,
};
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ ...record, finalText: undefined, scratch }, null, 2));
process.exit(record.holds ? 0 : 1);
