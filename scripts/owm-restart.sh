#!/bin/bash

# Rebuild OWM and restart it.
# Requires runowm.sh to be the parent process loop.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OWM_DIR="$SCRIPT_DIR/.."

cd "$OWM_DIR"
npm run build

# Tell the running OWM to exit with code 3 (restart without rebuild,
# since we already built above).
node ./build/cli/index.js --cmd exit --payload '{"code": 3}'
