# Door, phase 0

Gate (PLAN.md "0. Measure the door before building it"): at least one rule fires on 10% or more of sessions that claim done, and a hand check of 50 firings upholds 90%. **Result: fail on both counts.** The kill rule applies: the door stays a quiet hook, and phase 2 is the hero.

Rules: `bin/door-rules.mjs` (pure, no model). Run: `node --max-old-space-size=512 evidence/door.mjs` writes `door.json`. Hand-check samples: `--sample <n> --rule <a,b> --out <dir outside the repo> --seed <s>`. 0 model calls; peak RSS 287 MB.

Denominator: coding sessions (at least one Edit/Write/MultiEdit/NotebookEdit) whose final message claims done. Repository means a real checkout under the home directory; sandbox means a temp-folder run, mostly this repo's scripted experiment arms.

| rule           | repository (n=127) | sandbox (n=3,615) | hand check: yes / no / unclear | use          |
| -------------- | -----------------: | ----------------: | -----------------------------: | ------------ |
| `never-queued` |           6 (4.7%) |         14 (0.4%) |                     1 / 13 / 0 | warn         |
| `crossed-off`  |           3 (2.4%) |         10 (0.3%) |                      0 / 7 / 2 | warn         |
| `clipboard`    |           2 (1.6%) |            0 (0%) |                      0 / 2 / 0 | drop or warn |
| `homemade-id`  |             0 (0%) |        263 (7.3%) |                     0 / 17 / 0 | warn         |
| `left-a-note`  |             0 (0%) |         11 (0.3%) |                      0 / 6 / 0 | warn         |
| `last-run-red` |             0 (0%) |          2 (0.1%) |                      0 / 2 / 0 | warn         |
| any rule       |          11 (8.7%) |        300 (8.3%) |                1 / 47 / 2 (2%) |              |

The hand check is the model's (Claude's) judgment, not a person's: would a careful reviewer refuse this session as done for this rule's reason. 50 seeded firings: all 11 repository firings, 39 sandbox ones weighted toward the busiest rule.

**Precise enough to block a stop: none.** The one upheld firing (`never-queued`: a source file written after the last test run, then "both suites pass") is real, but 13 of 14 were not. Every rule should only warn.

Why they missed:

- `never-queued`: the test-claim detector matches quoted copy, domain text ("hidden tests passed") and spot-check reports (7); the runner is a smoke script or a wrapped command it does not know (3); no suite exists and the message says so (3). Blocking needs the project's declared test command, not a pattern list.
- `crossed-off`: assertions rewritten for a behaviour change the task asked for, or replaced by stronger ones (5); deleted files were artifacts or spec files (2).
- `homemade-id`: true 17 of 17, but every firing is the "with your own tests" arm, where the task asked for it and the message says "my tests". A fact to report, never a refusal.
- `left-a-note`: every firing is an interface-drafting task whose deliverable is a not-implemented stub.
- `last-run-red`: the error came from a non-test command on the same shell line; the tests had passed.

Tuning: patterns were tuned on two earlier seeded draws (58 firings) before the judged draw. The untuned first pass showed `never-queued` at 15.5% and `crossed-off` at 10.1% of repository sessions; those draws showed them to be doc and scratch-file edits after tests, compiled-output deletions, and the word "todo" in a todo app.

Limits:

- One person's sessions on one machine, all Claude Code (VS Code extension), only the transcripts still on disk: 373 repository sessions, only 127 in the denominator, so the repository shares carry wide error bars. Transcripts still in use shift counts by one between runs.
- 6,232 of 6,605 sessions are scripted experiment arms with fixed prompts, usually a public suite, and a deny-listed harness; they cannot touch harness files and rarely touch tests.
- Main sessions only: edits and test runs a session delegated to subagents are not seen, nor are edits made through the shell (`sed -i`, heredocs, scripts).
- No public agent-authored pull requests were measured (PLAN.md names them as the second corpus).
