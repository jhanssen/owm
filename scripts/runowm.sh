#!/bin/bash
if [ -z "${OWM_RUNOWM_STABLE:-}" ]; then
    STABLE="/tmp/runowm.$$.sh"
    cp -f -- "$0" "$STABLE"
    chmod +x "$STABLE"
    export OWM_RUNOWM_STABLE="$STABLE"
    export OWM_RUNOWM_SOURCE="$(readlink -f -- "$0")"
    exec "$STABLE" "$@"
fi

set -o pipefail

SCRIPT_PATH="${OWM_RUNOWM_SOURCE:-${BASH_SOURCE[0]}}"
while [ -h "${SCRIPT_PATH}" ]; do
    DIR="$(cd -- "$(dirname -- "${SCRIPT_PATH}")" && pwd)"
    SCRIPT_PATH="$(readlink -- "${SCRIPT_PATH}")"
    case "${SCRIPT_PATH}" in
        /*) : ;;
        *) SCRIPT_PATH="${DIR}/${SCRIPT_PATH}" ;;
    esac
done
SCRIPT_PATH="$(cd -- "$(dirname -- "${SCRIPT_PATH}")" && pwd)"

xsetroot -cursor_name left_ptr 2>/dev/null || true

BUILD=2
while true; do
    cd "$SCRIPT_PATH/.."
    if [ "$BUILD" = 1 ]; then
        npm install
        (cd native && npm run build)
    fi
    if [ "$BUILD" -lt 3 ]; then
        npm run build
    fi

    node ./build/src/index.js -- "$@" 2>&1 | tee -a /tmp/owm.log

    RC=${PIPESTATUS[0]}
    case $RC in
        0)
            exit 0
            ;;
        1)
            BUILD=1
            ;;
        2)
            BUILD=2
            ;;
        3)
            BUILD=3
            ;;
        *)
            echo "Bad exit code $RC"
            exit 1
            ;;
    esac
done
