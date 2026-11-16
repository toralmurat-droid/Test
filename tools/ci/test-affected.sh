#!/usr/bin/env bash
# Runs only the tests a change can affect (see affected-tests.mjs), then the ideas check. $1: the commit to compare HEAD with.
set -eo pipefail
sel=$(node tools/ci/affected-tests.mjs "$1")
if [ "$sel" = ALL ]; then npm test; exit 0; fi
if [ -n "$sel" ]; then npx tsx --test $sel; fi
npx tsx tools/ideas-check.ts
