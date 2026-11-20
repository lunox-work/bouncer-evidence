#!/bin/sh
# The ticket-only arm on unjs/ufo and unjs/pathe (RESULTS.md "Judged by the
# maintainers' own tests"): per case, 5 Haiku 5.5 and 5 Sonnet 5.5 runs from
# the commit subject and the declarations it adds (bin/run.mjs --brief
# ticket: base, no stub, no spec, no public suite, the agent's own tests),
# then evidence/maintainer-tests.mjs scores every stored run of both sets by
# the tests the real commit's maintainers wrote. ufo-join-relative is left
# out: it has no confirmed-spec runs to compare with (its commit rewrote
# existing tests). Resumable. From the package root:
#   sh evidence/maintainer-queue.sh
set -e
cd "$(dirname "$0")/.."
export BOUNCER_HOME="$PWD"
export BOUNCER_MAX_SESSIONS=3
export BOUNCER_MIN_FREE=35
mkdir -p evidence/maintainer-logs
for set in ufo pathe; do
  export BOUNCER_SPECS="evidence/in-repo-$set/specs"
  slugs=$(node -e 'for (const c of require("./evidence/in-repo-'$set'/cases.json")) if (c.slug !== "ufo-join-relative" && require("fs").existsSync(`evidence/in-repo-'$set'/specs/${c.slug}-confirmed/calibration.json`)) console.log(`${c.slug}-confirmed`)')
  for model in haiku sonnet; do
    # shellcheck disable=SC2086
    node bin/run.mjs $slugs --brief ticket --model "$model" --runs 5 --concurrency 2 >> "evidence/maintainer-logs/run-$set-$model.log" 2>&1 || exit $?
  done
done
for set in ufo pathe; do
  node --max-old-space-size=1024 evidence/maintainer-tests.mjs --cases "evidence/in-repo-$set/cases.json" > "evidence/in-repo-$set/maintainer-tests.log" 2>&1
done
