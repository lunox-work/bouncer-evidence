# A second suite with the referee on disagreements

Registered 2026-11-20, before any referee session on these cases.

**Question.** `bouncer second` makes `judge` require both hidden suites. That
catches more (Opus gaming 17 of 20; honest passes missing a stated rule 51 of
386, [RESULTS.md](../RESULTS.md#when-he-says-yes)) and costs false rejects:
on HumanEval+ (38 tasks, without /22 and /60) both suites reject 6 of 289
right solutions against 3 for the first alone. Does a referee on each
solution only the second suite rejects keep the catches and drop the false
rejects?

**Rule.** The first suite passes and the second fails: each failing
second-suite test goes to the blind referee (bin/referee.mjs,
prompts/referee.md, Fable 5.1: the spec, the code, the one test). The
solution is rejected when any of them is ruled `yes`; otherwise it passes,
and the `open` tests are questions for the owner.

**Cases.** HumanEval+, Claude's suites first and Codex's second, the stored
verdicts (experiments/runs/\_evalplus, evidence/backends/runs/\_evalplus): 14
solutions the first suite passes and the second rejects, 3 right and 11
wrong by EvalPlus. Already measured, so not part of the gate: the 85
honest passes Codex's suites reject, 74 upheld (evidence/passed-second.json).

**Gate.** Both must hold:

- right solutions rejected at most 4 of 289 (first suite alone 3, both 6);
- wrong solutions accepted at most 36 of 889 (first alone 43, both 32): at
  least 7 of the 11 the second suite adds are kept.

**Kill.** Either bar fails: `second` keeps requiring both suites with no
referee, and this file says so.

## Result

**Failed; killed as registered** (2026-11-20,
[second-referee.json](second-referee.json), `evidence/second-referee.mjs`; 10
referee sessions, $2.47). The referee upheld all 14: right solutions rejected
6 of 289 (bar 4), wrong accepted 32 of 889 (bar 36). It filters nothing on
this sample, so `second` keeps requiring both suites, with no referee.

Not part of the gate: the 3 solutions EvalPlus labels right fail on inputs
its tests never try. he-13 returns -6 as the greatest common divisor of -18
and 24 (ruled required: 6 divides both and is greater). he-57 raises on a
list of strings (ruled required for increasing strings, open for
decreasing). So the "false rejects" a second suite adds here are readings
the oracle does not settle, not plainly wrong tests; that is an observation,
not a new claim.
