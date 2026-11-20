#!/usr/bin/env node
// Phase 0 (PLAN.md "0. Measure the door before building it"): how often the
// door's no-model rules (bin/door-rules.mjs) fire on finished Claude Code
// sessions, read from local transcripts. No model, no network.
//
//   node --max-old-space-size=512 evidence/door.mjs [--root <dir>] [--limit <n>]
//       every main-session transcript under <root> (default
//       ~/.claude/projects/*/*.jsonl; subagent files and sidechain events
//       skipped), one file at a time, streamed line by line; writes
//       evidence/door.json (counts and rule names only; handCheck is kept)
//   node --max-old-space-size=512 evidence/door.mjs --sample <n> --rule <a,b> --out <dir> [--seed <s>] [--scope repository|sandbox|all]
//       the same pass, keeping n seeded random firings of each rule (reservoir
//       sampling over the sorted file order) with short excerpts, written to
//       <dir>/sample-<rule>.json for a hand check. Excerpts hold private code
//       and conversation: <dir> must be outside this repository.
//
// Denominator: coding sessions (at least one successful Edit, Write,
// MultiEdit or NotebookEdit) whose final assistant text claims done.

import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { addClaudeCodeEvent, claimsOf, DOOR_RULES, doorRules, editsOf, finalText } from "../bin/door-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "evidence", "door.json");

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const root = resolve(option("root") ?? join(homedir(), ".claude", "projects"));
const limit = option("limit") === undefined ? Infinity : Number(option("limit"));
const sampleSize = option("sample") === undefined ? 0 : Number(option("sample"));
const sampleRules = (option("rule") ?? "").split(",").filter(Boolean);
const sampleOut = option("out");
let seed = Number(option("seed") ?? 20261119) >>> 0;

if (sampleSize > 0) {
  if (sampleRules.length === 0 || sampleOut === undefined) {
    console.error("usage: node evidence/door.mjs --sample <n> --rule <a,b> --out <dir outside the repo> [--seed <s>]");
    process.exit(2);
  }
  if (`${resolve(sampleOut)}${sep}`.startsWith(`${ROOT}${sep}`)) {
    console.error("--out must be outside this repository: excerpts hold private transcripts.");
    process.exit(2);
  }
  for (const rule of sampleRules) if (!DOOR_RULES.includes(rule)) throw new Error(`unknown rule ${rule}`);
}

// mulberry32: a seeded generator, so a sample can be drawn again.
const random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Main-session transcripts, sorted: <root>/<project>/<id>.jsonl, not agent-*.jsonl (older sidechain files). */
function* transcripts() {
  for (const project of readdirSync(root).sort()) {
    const folder = join(root, project);
    let names;
    try {
      if (!statSync(folder).isDirectory()) continue;
      names = readdirSync(folder).sort();
    } catch {
      continue;
    }
    for (const name of names) if (name.endsWith(".jsonl") && !name.startsWith("agent-")) yield join(folder, name);
  }
}

async function readSession(file) {
  const session = [];
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    // Bookkeeping events (api-request-blob and the like) start with their type; skip them unparsed.
    if (line.startsWith('{"type":"') || line === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.isSidechain === true) continue;
    addClaudeCodeEvent(session, event);
  }
  return { session };
}

// Scope by where the session ran: a project folder under the home directory is
// a real repository; one under a temp folder is a scripted sandbox run
// (mostly this repository's own experiment arms).
const scopeOf = (file) => (/^-(Users|home)-/.test(file.split(sep).at(-2) ?? "") ? "repository" : "sandbox");
const SCOPES = ["repository", "sandbox", "all"];
// The test commands the experiment sandboxes declare in their README (the
// real door reads the project's own, such as package.json's "test").
const DECLARED_TEST_COMMANDS = [/^python\d?(\.\d+)?\s+sandbox\/run\.py\b/, /^node\s+sandbox\/run\.mjs\b/];
const blankScope = () => ({
  scanned: 0,
  withAssistantText: 0,
  coding: 0,
  claimsDone: 0,
  claimsDoneCoding: 0,
  claimsTestsPassCoding: 0,
  anyRejection: 0,
  rules: Object.fromEntries(
    DOOR_RULES.filter((rule) => rule !== "claims-done").map((rule) => [rule, { fires: 0, firesAmongClaimsDone: 0 }]),
  ),
});
const totals = Object.fromEntries(SCOPES.map((scope) => [scope, blankScope()]));
const sampleScope = option("scope") ?? "repository";
const reservoirs = Object.fromEntries(sampleRules.map((rule) => [rule, { seen: 0, kept: [] }]));
let peakRss = 0;
let scanned = 0;

const firstUser = (session) => session.find((event) => event.kind === "user")?.text ?? "";
const flat = (text, max) => {
  const out = String(text).replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
};

for (const file of transcripts()) {
  if (scanned >= limit) break;
  scanned += 1;
  const scope = scopeOf(file);
  const rows = [totals[scope], totals.all];
  for (const row of rows) row.scanned += 1;
  const { session } = await readSession(file);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  if (scanned % 500 === 0) console.error(`${scanned} sessions, rss ${Math.round(peakRss / 1048576)} MB peak`);
  if (!session.some((event) => event.kind === "text")) continue;
  const coding = editsOf(session).length > 0;
  const fired = doorRules(session, { testCommands: DECLARED_TEST_COMMANDS });
  const done = fired.some((item) => item.rule === "claims-done");
  const counted = coding && done;
  const rejections = fired.filter((item) => item.rule !== "claims-done");
  for (const row of rows) {
    row.withAssistantText += 1;
    if (coding) row.coding += 1;
    if (done) row.claimsDone += 1;
    if (counted) {
      row.claimsDoneCoding += 1;
      if (claimsOf(finalText(session)).testsPass) row.claimsTestsPassCoding += 1;
      if (rejections.length > 0) row.anyRejection += 1;
    }
    for (const item of rejections) {
      row.rules[item.rule].fires += 1;
      if (counted) row.rules[item.rule].firesAmongClaimsDone += 1;
    }
  }
  if (!counted || (sampleScope !== "all" && sampleScope !== scope)) continue;
  for (const item of rejections) {
    const reservoir = reservoirs[item.rule];
    if (reservoir === undefined) continue;
    reservoir.seen += 1;
    const entry = () => ({
      file,
      scope,
      rule: item.rule,
      reason: item.reason,
      evidence: item.evidence,
      alsoFired: rejections.map((other) => other.rule).filter((rule) => rule !== item.rule),
      firstPrompt: flat(firstUser(session), 500),
      finalText: flat(finalText(session), 900),
    });
    if (reservoir.kept.length < sampleSize) reservoir.kept.push(entry());
    else {
      const slot = Math.floor(random() * reservoir.seen);
      if (slot < sampleSize) reservoir.kept[slot] = entry();
    }
  }
}

const share = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 10000) / 10000);
const TESTS_PASS_RULES = new Set(["never-queued", "homemade-id", "last-run-red"]);

if (sampleSize > 0) {
  mkdirSync(sampleOut, { recursive: true });
  for (const [rule, reservoir] of Object.entries(reservoirs)) {
    writeFileSync(
      join(sampleOut, `sample-${rule}.json`),
      `${JSON.stringify({ rule, firingsAmongClaimsDone: reservoir.seen, kept: reservoir.kept }, null, 2)}\n`,
    );
    console.log(
      `${rule}: kept ${reservoir.kept.length} of ${reservoir.seen} -> ${join(sampleOut, `sample-${rule}.json`)}`,
    );
  }
} else {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const summary = (row) => ({
    sessions: {
      scanned: row.scanned,
      withAssistantText: row.withAssistantText,
      coding: row.coding,
      claimsDone: row.claimsDone,
      claimsDoneCoding: row.claimsDoneCoding,
      claimsTestsPassCoding: row.claimsTestsPassCoding,
    },
    anyRejection: { firesAmongClaimsDone: row.anyRejection, share: share(row.anyRejection, row.claimsDoneCoding) },
    rules: Object.fromEntries(
      Object.entries(row.rules).map(([rule, counts]) => [
        rule,
        {
          ...counts,
          share: share(counts.firesAmongClaimsDone, row.claimsDoneCoding),
          ...(TESTS_PASS_RULES.has(rule)
            ? { shareAmongClaimsTestsPass: share(counts.firesAmongClaimsDone, row.claimsTestsPassCoding) }
            : {}),
        },
      ]),
    ),
  });
  const report = {
    phase: "0. Measure the door before building it (PLAN.md)",
    corpus:
      "local Claude Code transcripts on one machine, one person; main sessions only (subagent files and sidechain events skipped)",
    modelCalls: 0,
    denominator:
      "coding sessions (at least one successful Edit/Write/MultiEdit/NotebookEdit) whose final assistant text claims done; share = firesAmongClaimsDone / claimsDoneCoding",
    scopes: {
      repository: "sessions in a real repository under the home directory (the gate is read here)",
      sandbox: "sessions in temp-folder sandboxes, mostly scripted experiment arms with a public suite",
    },
    ...Object.fromEntries(SCOPES.map((scope) => [scope, summary(totals[scope])])),
    peakRssMB: Math.round(peakRss / 1048576),
    ...(previous.handCheck === undefined ? {} : { handCheck: previous.handCheck }),
  };
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  for (const scope of SCOPES) console.log(scope, JSON.stringify(report[scope]));
}
