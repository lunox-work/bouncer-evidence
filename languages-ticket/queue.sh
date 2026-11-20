#!/bin/sh
# evidence/PLAN.md phase 2, reach step 2: the ID check outside TypeScript. Loose-ticket
# runs (bin/run.mjs --brief ticket: the ticket and the stub, no spec, no
# public suite, the agent's own tests) of duration-parse ported to Python (prepared here first), Go and
# Rust, graded, then evidence/id-blind.mjs on the rejected ones as
# evidence/id-languages.json. Resumable: a finished run is skipped. Its own
# home, because grade.mjs rewrites the home's results.jsonl; the Go and Rust
# toolchains are evidence/languages'. From the package root:
#   RUNS=15 sh evidence/languages-ticket/queue.sh
set -e
cd "$(dirname "$0")/../.."
H=evidence/languages-ticket
mkdir -p "$H/logs"
[ -e "$H/toolchains" ] || ln -s ../languages/toolchains "$H/toolchains"
export BOUNCER_HOME="$H"
export BOUNCER_SPECS=evidence/languages/specs
export BOUNCER_MAX_SESSIONS=1
export BOUNCER_MIN_FREE=40
[ -f evidence/languages/specs/duration-parse-py/calibration.json ] || BOUNCER_HOME=evidence/languages node bin/prepare.mjs duration-parse-py >> "$H/logs/prepare-duration-parse-py.log" 2>&1
for slug in duration-parse-py duration-parse-go duration-parse-rs; do
  node bin/run.mjs "$slug" --brief ticket --model haiku --runs "${RUNS:-15}" --concurrency 1 >> "$H/logs/run-$slug.log" 2>&1
done
node bin/grade.mjs duration-parse-py duration-parse-go duration-parse-rs >> "$H/logs/grade.log" 2>&1
node evidence/id-blind.mjs --runs-root "$H/runs" --specs-root evidence/languages/specs --arm ticket-haiku --name id-languages >> "$H/logs/id.log" 2>&1
