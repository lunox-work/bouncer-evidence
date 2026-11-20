# The ID check, phase 2

Gate (PLAN.md "2. The ID check"): on stored runs, the decision that failed a
hidden suite is in the list for 90% or more of rejected runs; the list in 60
seconds and $0.05 or less; median person time to answer 3 minutes or less.

## The blind pass, 2026-11-20

Data: [id-blind.json](id-blind.json), one list and one judgment per run in
[id-blind/](id-blind/). Script: [id-blind.mjs](id-blind.mjs). Runs: all 75
rejected runs of the 105 loose-ticket runs,
`experiments/runs/<spec>/self-tested-haiku-ticket/<n>`
([bouncer-evidence](https://github.com/lunox-work/bouncer-evidence),
`sh scripts/fetch-evidence.sh`). Each list: `bouncer id` (prompts/id.md,
Claude Sonnet 5.5, one session) given the stored ticket and diff only.

Judge: Claude Opus 5.5, one session per run, given the list (each question
and the agent's pick) and every scenario of the spec, unlabelled, in spec
order. For each scenario it names the item that settles it, or none, and
whether that item's pick agrees with the scenario. It never sees the diff,
the grades or which scenarios failed: blind to the outcome, not to the
agent's picks. Scored afterwards against the grades.

| measure                                                     |                 result |
| ----------------------------------------------------------- | ---------------------: |
| Rejected runs with a failing scenario matched to an item    |     **74 of 75** (99%) |
| Failing scenarios matched to an item                        |       172 of 199 (86%) |
| Passing scenarios matched to an item (the base rate)        |       309 of 350 (88%) |
| Pick judged to disagree, scenario failed                    |           **70 of 70** |
| Pick judged to disagree, scenario passed                    |               0 of 306 |
| Failing scenarios whose matched pick was judged to disagree |        70 of 164 (43%) |
| Rejected runs with such a pick on a failing scenario        |     **57 of 75** (76%) |
| Median list: items, seconds, cost                           | 12 items, 17 s, $0.061 |
| Lists at the 12-item cap                                    |               61 of 75 |

What it says:

- **The registered gate passes on coverage, and coverage is the weak
  number.** A failing decision is in the list for 74 of 75 rejected runs,
  but passing scenarios are matched just as often (88% against 86%): a
  twelve-item list covers most of a small spec whether or not anything
  failed. Read it as "the list covers the decisions the ticket left open",
  not "it found the failure".
- **The pointing number is the strong one.** Added after the first 12 runs
  on a peer session's review, before any of these numbers were read. Where a
  reader who knows what was meant (the judge, holding the spec) says a
  listed pick is wrong, the hidden suite failed that scenario every time, 70
  of 70, with no false alarm in 306 checks. That reader catches a wrong pick
  in 57 of 75 rejected runs from the list alone. It misses the rest because
  a pick written in one sentence is often too vague to contradict a
  scenario, or the failure is in a detail the pick does not state.
- **Cost misses its bar:** $0.061 median against $0.05, $0.075 at most.
  Time passes: 17 s median against 60 s.
- **Person time is still unmeasured.** `confirm` records it once people use
  the list to confirm a spec. The judge stands in for a person here, which
  makes these numbers an upper bound on what a hurried person spots.
- 61 of 75 lists hit the cap of twelve, so the model chose what to drop, and
  the 2026-10-28 check found its own ranking no better than chance. The one
  run with no failing scenario matched (gherkin-parse 1, happy-1) is a list
  that left that scenario's question out.

Lost and rerun: all 12 gherkin-parse lists first came back unparsed because
an item quoted a code fence and the JSON extraction stopped at it; fixed in
`bin/id.mjs` (`lastJsonBlock`, 17e2f90) and rerun. Cost of the pass: $4.49 of
lists, $6.41 of judging.

## Outside TypeScript, 2026-11-20

Data: [id-languages.json](id-languages.json), lists and judgments in
[id-languages/](id-languages/), grades in
[languages-ticket/results.jsonl](languages-ticket/results.jsonl). Runs:
duration-parse in Python (a port of the Go spec, prepared for this pass),
Go and Rust, 15 runs each of Claude Haiku given only the loose ticket and the
stub (`bin/run.mjs --brief ticket`). All 45 were rejected by the hidden
suite. Same script, list model and judge as above (`evidence/id-blind.mjs
--runs-root evidence/languages-ticket/runs --specs-root
evidence/languages/specs --arm ticket-haiku --name id-languages`).

| measure                                                  |                 result |
| -------------------------------------------------------- | ---------------------: |
| Rejected runs with a failing scenario matched to an item |     **44 of 45** (98%) |
| Failing scenarios matched / passing ones (base rate)     |        88% against 78% |
| Pick judged to disagree, scenario failed                 |         **103 of 103** |
| Pick judged to disagree, scenario passed                 |               0 of 227 |
| Rejected runs with such a pick on a failing scenario     |     **35 of 45** (78%) |
| Median list: items, seconds, cost                        | 12 items, 14 s, $0.056 |

By language, runs where a wrong pick was named: Python 15 of 15, Rust 15 of
15, Go 5 of 15. Every Go run failed only `unhappy-1` (one error case), and
the judge matched it to an item whose pick it read as agreeing in 8 runs.
The one coverage miss is Go run 4. The plan's kill rule (under 90% outside
TypeScript means the README says "TypeScript") does not fire. One spec in
three languages, so this shows the list is not tied to TypeScript, not how
it does across Python or Go codebases.

## The first sample, 2026-11-19

10 of 10 rejected runs had a failing decision in the list (25 of 28 failing
scenarios), judged by the session that wrote bin/id.mjs, which had read the
failing tests: not blind. Superseded by the pass above; kept in
[id.json](id.json).

## Executed picks, 2026-11-20: no gain

Data: [id-probes.json](id-probes.json), per run in [id-probes/](id-probes/).
Script: [id-probes.mjs](id-probes.mjs). Registered before any run: showing
what the code returns helps when a wrong pick is named in 62 or more of the
75 runs with at most 3 false alarms. The same 75 lists; a Sonnet 5.5 session
per run wrote one call per item (prompts/id-probe.md, given the ticket, the
run's src/ and the list), every one of the 874 calls ran against the built
code, and the same Opus 5.5 judge saw each item with `ran:` and the output.

| measure                            | list alone | with executed picks |
| ---------------------------------- | ---------: | ------------------: |
| Runs where a wrong pick is named   |   57 of 75 |            55 of 75 |
| Pick judged wrong, scenario passed |          0 |                   3 |
| Pick judged wrong, scenario failed |         70 |                  70 |
| Cost a run (probes, then judging)  |            |      $0.058, $0.118 |

It fails its bar, so `bouncer id` stays a list. The misses are where they
were: invite-codes (2 of 15 named, 4 before) fails on two codes issued at
once over a slow store, which one call cannot show, and gherkin-parse (5 of
12, 6 before) on error line numbers the picks already state. Seeing the
value made the judge call three right picks wrong.
