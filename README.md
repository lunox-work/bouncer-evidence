# bouncer-evidence

The runs, data and write-ups behind [Bouncer](https://github.com/lunox-work/bouncer)
(called independent-tests, then double-blind, then duediligence while these
experiments ran): 26 TypeScript specs, the LiveCodeBench and HumanEval+
pilots, the spec ladder, every arm, brief and mechanism tried, and the
scripts that ran them. Moved out of the bouncer repository on 2026-11-20 so
that installing the skill does not clone 3,900 files; its history up to
then is still in bouncer's git log. Nothing here is needed to run Bouncer.

Bouncer's `evidence/*.mjs` scripts read this folder as `experiments/` in a
bouncer checkout: `sh scripts/fetch-evidence.sh` there clones it into place.

- [EXPERIMENT.md](EXPERIMENT.md): the method, the parties, the verdicts,
  the arms and the tools.
- [FINDINGS.md](FINDINGS.md): dated results, newest conclusions in the
  Summary on top.
- [ladder/README.md](ladder/README.md): the spec-ladder pilot, judged by
  oracles no model wrote.
- [RESULTS.md](https://github.com/lunox-work/bouncer/blob/main/RESULTS.md):
  Bouncer's summary of these results.

## Reading the data

- Files over 5 MiB (the spec ladder's LiveCodeBench `tests/private/cases.json`
  files and `brag-output/brag.mp4`) are in a
  [GitHub release](https://github.com/lunox-work/duediligence/releases/tag/experiments-large-files-2026-11-11),
  not in git. `sh fetch-large-files.sh` restores them.
- `results.jsonl`: one line per graded run, verdict and counts only. 708
  of its 3,230 rows are sessions that never ran: the `claude` CLI lost its
  login on 2026-10-24 about 16:50 and every later session returned "Not
  logged in" in 0.1 s. They have `agent.ok === false` and `turns: 1`;
  filter them before counting ([Follow-ups](FINDINGS.md#follow-ups)).
- `results-blind.jsonl`: the first 230 runs graded by the blind hidden
  suites (`specs/*/tests/private-blind/`), kept for comparison.
- `classifications.json`: every overfit classed by hand, `real`,
  `spec-gap` or `judge-defect`.
- `acceptance.jsonl`, `referee.jsonl`: agents' own tests rerun on their
  code and on the reference; a blind referee's ruling on each disagreement.
- `mutation.jsonl`, `evalplus-results.json`: mutants judged by both suites;
  HumanEval+ solutions judged by generated suites.
- `ladder/results.jsonl`: the spec-ladder runs, scored against the oracles.
- `runs/` is gitignored: transcripts, diffs, submissions and grade.json
  per run.

## Running it again

```sh
cd template && npx -y npm@10.9.2 ci && cd ..
node bin/generate.mjs <slug> && node bin/calibrate.mjs <slug>
node bin/run.mjs <slug> --arm double-blind --model haiku --runs 3
node bin/grade.mjs <slug> && node bin/report.mjs
```

Arms, briefs, the Python toolchain and the other tools are in
[EXPERIMENT.md](EXPERIMENT.md). The scripts share `bin/lib.mjs`; the
skill's scripts are a trimmed copy of the same code.
