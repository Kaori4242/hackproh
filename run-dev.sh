#!/usr/bin/env bash

set -euo pipefail

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev --prefix /Users/kaori/Documents/hackproh/services/chat &
npm run dev --prefix /Users/kaori/Documents/hackproh/apps/web &

wait
