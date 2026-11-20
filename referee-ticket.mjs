#!/usr/bin/env node
// The blind referee on the 75 loose-ticket rejections (RESULTS.md "The
// agent's own green run"). The archive's referee ruled on 100 rejections of
// runs that read the precise spec, none of these. Two questions:
//
// 1. Spec: does the spec require what the failing test asserts? The
//    archive's referee as it was (bin/referee.mjs, prompts/referee.md,
//    Fable 5.1, one test, the spec and the run's src/), on cases built here
//    from each rejected run's grade.json: every distinct failing test, public
//    or hidden (the agent saw neither), with the first failing run's src/.
//    Refereed in rounds: each round takes, for every run with no test ruled
//    `yes` yet, one untried test of that run, the ones failing the most such
//    runs first, and passes them to referee.mjs with --only. A run is upheld
//    when any test it fails is ruled `yes`, as in the archive, and a round
//    stops trying a run once one is: per run, the same answer as refereeing
//    every case, in fewer sessions.
// 2. Ticket: does the ticket the agent read state the outcome? One session
//    per spec (prompts/referee-ticket.md, the same model): ticket.md, both
//    suites' files renamed so neither reads as hidden, and the list of the
//    spec's failing tests; never the spec, the code or the grades. A run
//    "broke the ticket" when any test it fails is ruled `states`; the rest
//    failed only on what the ticket left open.
//
//   node evidence/referee-ticket.mjs [--spec-only | --ticket-only] [--dry]
//
// Resumable: evidence/referee-ticket/spec.jsonl (referee.mjs's own resume)
// and ticket-<spec>.json; transcripts under runs/_referee-ticket/ (and
// runs/_referee/ for the spec question). Writes evidence/referee-ticket.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROMPTS, ROOT, RUNS, args, copy, discard, log, session, workdir } from "../bin/lib.mjs";

const MODEL = "claude-fable-5-1";
const ARM = "self-tested-haiku-ticket";
const ARCHIVE = join(ROOT, "experiments");
const OUT = join(ROOT, "evidence", "referee-ticket");
const { options } = args();
mkdirSync(OUT, { recursive: true });
const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);

// The 75 rejected runs and their failing tests.
const rejected = lines(join(ARCHIVE, "results.jsonl")).filter((row) => row.variant === ARM && row.agent?.ok !== false && row.verdict !== "passed");
const cases = new Map();
const runs = rejected.map((row) => {
  const dir = join(ARCHIVE, "runs", row.spec, ARM, String(row.run));
  const grade = JSON.parse(readFileSync(join(dir, "grade.json"), "utf8"));
  const failures = [...grade.publicFailures.map((f) => ({ ...f, suite: "public" })), ...grade.hiddenFailures.map((f) => ({ ...f, suite: "hidden" }))];
  const run = `${ARM}/${row.run}`;
  const ids = [];
  for (const failure of failures) {
    const id = `suite:${row.spec}:${failure.id}`;
    if (!cases.has(id)) cases.set(id, { id, kind: "suite", spec: row.spec, suite: failure.suite, name: failure.id.split(" :: ")[1], src: join(dir, "submission", "src"), message: failure.error?.message ?? "", runs: [], ownGreenRuns: [] });
    cases.get(id).runs.push(run);
    cases.get(id).ownGreenRuns.push(run);
    ids.push(id);
  }
  return { key: `${row.spec}/${run}`, spec: row.spec, verdict: row.verdict, ids };
});
const casesFile = join(OUT, "cases.jsonl");
writeFileSync(casesFile, [...cases.values()].map((item) => JSON.stringify(item)).join("\n") + "\n");
log(`${runs.length} rejected runs, ${cases.size} distinct failing tests`);

// 1. The spec question, in rounds.
const specOut = join(OUT, "spec.jsonl");
if (options["ticket-only"] !== true) {
  for (let round = 1; ; round += 1) {
    const ruled = new Map(lines(specOut).map((line) => [line.id, line.requires]));
    const open = runs.filter((run) => !run.ids.some((id) => ruled.get(id) === "yes") && run.ids.some((id) => !ruled.has(id)));
    if (open.length === 0) break;
    const reach = (id) => open.filter((run) => run.ids.includes(id)).length;
    const picked = new Set();
    for (const run of open) {
      if (run.ids.some((id) => picked.has(id))) continue;
      const untried = run.ids.filter((id) => !ruled.has(id)).sort((a, b) => reach(b) - reach(a));
      picked.add(untried[0]);
    }
    log(`spec round ${round}: ${open.length} runs unresolved, ${picked.size} case(s)`);
    if (options.dry === true) break;
    const only = join(RUNS, "_referee-ticket", "only.txt");
    mkdirSync(dirname(only), { recursive: true });
    writeFileSync(only, [...picked].join("\n") + "\n");
    const child = spawnSync(process.execPath, [join(ROOT, "bin", "referee.mjs"), "--cases", casesFile, "--only", only, "--out", specOut, "--model", MODEL, "--concurrency", "1"], { stdio: "inherit" });
    if (child.status === 2) process.exit(2);
    const after = new Set(lines(specOut).map((line) => line.id));
    if (![...picked].some((id) => after.has(id))) {
      log("no case of this round was recorded; stopping");
      break;
    }
  }
}

// 2. The ticket question, one session per spec.
const specs = [...new Set(runs.map((run) => run.spec))];
if (options["spec-only"] !== true && options.dry !== true) {
  for (const spec of specs) {
    const file = join(OUT, `ticket-${spec}.json`);
    if (existsSync(file)) continue;
    const listed = [...cases.values()].filter((item) => item.spec === spec);
    const dir = workdir(`referee-ticket-${spec}`);
    try {
      copy(join(ARCHIVE, "specs", spec, "ticket.md"), join(dir, "ticket.md"));
      // Suite folders renamed, so neither reads as the hidden one.
      copy(join(ARCHIVE, "specs", spec, "tests", "public"), join(dir, "tests", "a"));
      copy(join(ARCHIVE, "specs", spec, "tests", "private"), join(dir, "tests", "b"));
      const shown = (item) => item.id.slice(`suite:${spec}:`.length).replace("tests/public/", "tests/a/").replace("tests/private/", "tests/b/");
      writeFileSync(join(dir, "cases.json"), JSON.stringify(listed.map(shown), null, 2));
      const text = readFileSync(join(PROMPTS, "referee-ticket.md"), "utf8");
      const result = await session({ cwd: dir, text, transcript: join(RUNS, "_referee-ticket", `ticket-${spec}.transcript.jsonl`), kind: "generate", model: MODEL });
      if (result.apiError === "usage_limit_reached") process.exit(2);
      const last = result.finalText.trim().split("\n").reverse().find((line) => line.trim().startsWith("["));
      let answers = null;
      try {
        answers = JSON.parse(last);
      } catch {}
      if (!Array.isArray(answers) || answers.length !== listed.length) {
        log(spec, `ticket session gave no usable answer (${answers?.length ?? "none"} of ${listed.length}); left for a rerun`);
        continue;
      }
      const ruled = listed.map((item, at) => ({ id: item.id, ticket: answers[at].ticket, quote: answers[at].quote ?? "" }));
      writeFileSync(file, JSON.stringify({ spec, model: result.model, costUsd: result.costUsd, ruled }, null, 2));
      log(spec, `ticket: ${ruled.filter((r) => r.ticket === "states").length} states, ${ruled.filter((r) => r.ticket === "open").length} open, ${ruled.filter((r) => r.ticket === "contradicts").length} contradicts`);
    } finally {
      discard(dir);
    }
  }
}

// The summary.
const specRuled = new Map(lines(specOut).map((line) => [line.id, line]));
const ticketRuled = new Map(specs.flatMap((spec) => (existsSync(join(OUT, `ticket-${spec}.json`)) ? JSON.parse(readFileSync(join(OUT, `ticket-${spec}.json`), "utf8")).ruled : []).map((r) => [r.id, r.ticket])));
const perRun = runs.map((run) => ({
  run: run.key,
  verdict: run.verdict,
  upheld: run.ids.some((id) => specRuled.get(id)?.requires === "yes"),
  allTried: run.ids.every((id) => specRuled.has(id)),
  brokeTicket: run.ids.some((id) => ticketRuled.get(id) === "states"),
  ticketKnown: run.ids.every((id) => ticketRuled.has(id)),
}));
const count = (rows, key) => rows.filter((row) => row[key]).length;
const bySpec = Object.fromEntries(specs.map((spec) => {
  const rows = perRun.filter((row) => row.run.startsWith(`${spec}/`));
  return [spec, { rejected: rows.length, upheld: count(rows, "upheld"), brokeTicket: count(rows, "brokeTicket") }];
}));
const tally = (key) => Object.fromEntries(["yes", "open", "no", "states", "contradicts"].map((v) => [v, [...specRuled.values(), ...[...ticketRuled.entries()].map(([, t]) => ({ ticket: t }))].filter((r) => r[key] === v).length]).filter(([, n]) => n > 0));
const summary = {
  at: new Date().toISOString(),
  model: MODEL,
  runs: runs.length,
  cases: cases.size,
  spec: { refereed: specRuled.size, requires: tally("requires"), runsUpheld: count(perRun, "upheld"), runsUnresolved: perRun.filter((r) => !r.upheld && !r.allTried).length, costUsd: [...specRuled.values()].reduce((sum, r) => sum + (r.costUsd ?? 0), 0) },
  ticket: { refereed: ticketRuled.size, ticket: tally("ticket"), runsBrokeTicket: count(perRun, "brokeTicket"), runsKnown: count(perRun, "ticketKnown") },
  bySpec,
  perRun,
};
writeFileSync(join(ROOT, "evidence", "referee-ticket.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ ...summary, perRun: undefined }, null, 2));
