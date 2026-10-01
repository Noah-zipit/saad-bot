#!/bin/bash
# Lean production runner for saad-bot.
# Runs the prebuilt bundle with plain node (no tsx overhead) and a modest
# heap cap. Session (./sessions) and database (./data) persist across restarts,
# so re-pairing is not needed.
set -u
cd "$(dirname "$0")"
if [ ! -f dist/index.js ]; then
  echo "dist/index.js missing - run 'npm run build' first" >&2
  exit 1
fi
export NODE_OPTIONS="--max-old-space-size=384"
exec node dist/index.js
