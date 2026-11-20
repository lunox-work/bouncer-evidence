# bouncer-evidence

The runs, data and write-ups behind [Bouncer](https://github.com/lunox-work/bouncer)'s
numbers. [docs/RESULTS.md](https://github.com/lunox-work/bouncer/blob/main/docs/RESULTS.md)
in the Bouncer repository is the summary; every figure there cites a file
here. Nothing here is needed to run Bouncer. Kept out of the Bouncer
repository since 2026-11-20 so that installing it does not clone thousands of
files; the history up to then is in Bouncer's git log.

## Layout

- The root: each measurement since 2026-10-26 as a script (`<name>.mjs`), its
  result (`<name>.json`) and its folder of specs, logs and queues
  (`<name>/`). Write-ups: [ID.md](ID.md) (the ID check), [DOOR.md](DOOR.md)
  (the door's rules), [second-referee.md](second-referee.md), and
  [PLAN.md](PLAN.md), the registration record of each pre-registered gate.
- [archive/](archive/README.md): the first experiment, 2026-10-23 to
  2026-10-25, about 3,000 graded runs on 26 TypeScript specs, LiveCodeBench,
  HumanEval+ and the spec ladder. Its write-ups:
  [FINDINGS.md](archive/FINDINGS.md), [EXPERIMENT.md](archive/EXPERIMENT.md),
  [ladder/README.md](archive/ladder/README.md).

## Index

```
in-repo.mjs, in-repo/  the repository arm: 11 sandbox-factory commits replayed; any repository with --cases
default-match.mjs   drafted defaults against confirmed decisions, from default-match.json
evalplus.mjs        the HumanEval+ oracle row, re-judged on the pytest runner (evalplus.json)
runners/            the Python and Jest end-to-end specs (docs/RESULTS.md "Runners")
ci.mjs              CI mode on the 11 repository cases, locally (ci/: checks, logs, ledger, fork script)
backends.mjs        the writer-backend table: sandbox test, mock API test, scripted calibration, ladder, report
mutation.mjs        mutants of a spec's reference judged by its suites (backends/: Codex suites, queue.sh)
implementers.mjs    non-Claude agents (Codex CLI; Aider, Cursor adapters) on handouts, graded (implementers/: queue.sh)
red-team/           the Haiku and Opus red-team runs' audits and logs (docs/RESULTS.md "Red team")
in-repo-ufo/, in-repo-pathe/  the repository arm on unjs/ufo and unjs/pathe (in-repo.mjs --cases; in-repo-queue.sh)
seams.mjs           black-box seams: patch-apply as a command against git apply, the HTTP spec, selftests (seams/)
languages.mjs       Go and Rust modules end to end; commands and services in Python, Go and Rust: selftest, ports, git oracle (languages/)
door.mjs            the door's rules on local sessions (door.json, DOOR.md)
ID.md               the ID check on 10 rejected runs (id.json)
fit-funnel.mjs, fit-funnel-commits.mjs  which repositories fit, per repository and per commit, static (docs/RESULTS.md "Which repositories fit")
skill-triggers.json  prompts that should and should not load the skill
```

## Running a script again

The scripts import Bouncer's `bin/` and read the archive as `experiments/`,
so they run from a Bouncer checkout:

```sh
git clone https://github.com/lunox-work/bouncer.git && cd bouncer
sh scripts/fetch-evidence.sh   # clones this repository as evidence/, links experiments -> evidence/archive
node evidence/<name>.mjs
```

Results land in this clone; commit them here, not in Bouncer.
