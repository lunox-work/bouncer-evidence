#!/bin/sh
# The loose-ticket arms on stronger implementers (RESULTS.md "Stronger
# implementers"). The archive's 7 loose-ticket specs, imported unchanged
# (bin/import-archive.mjs), each run from the ticket alone with the agent's
# own tests (--brief ticket) and from the ticket plus the public suite
# (--brief ticket-public), on Haiku 5.5 (the archive's model, rerun on this
# harness so the models compare on one harness), Sonnet 5.5 and Opus 5.5.
# Graded by the archive's hidden suites. Resumable: a finished run is
# skipped. Its own home, because grade.mjs rewrites the home's
# results.jsonl. From the package root:
#   RUNS=5 sh evidence/stronger/queue.sh
set -e
cd "$(dirname "$0")/../.."
H=evidence/stronger
mkdir -p "$H/logs"
export BOUNCER_HOME="$H"
export BOUNCER_MAX_SESSIONS=2
export BOUNCER_MIN_FREE=40
SPECS="status-normalize csv-export weekly-digest escrow-split invite-codes gherkin-parse usage-counter"
for brief in ticket ticket-public; do
  for model in haiku sonnet opus; do
    # shellcheck disable=SC2086
    node bin/run.mjs $SPECS --brief "$brief" --model "$model" --runs "${RUNS:-5}" --concurrency 2 >> "$H/logs/run-$brief-$model.log" 2>&1 || exit $?
    # shellcheck disable=SC2086
    node bin/grade.mjs $SPECS >> "$H/logs/grade.log" 2>&1
  done
done
