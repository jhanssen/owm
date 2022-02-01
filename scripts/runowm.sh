#!/bin/bash

pushd . > /dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}";
while([ -h "${SCRIPT_PATH}" ]); do
    cd "`dirname "${SCRIPT_PATH}"`"
    SCRIPT_PATH="$(readlink "`basename "${SCRIPT_PATH}"`")";
done
cd "`dirname "${SCRIPT_PATH}"`" > /dev/null
SCRIPT_PATH="`pwd`";
popd > /dev/null

BUILD=2
while true; do
    cd $SCRIPT_PATH/..
    if [ "$BUILD" = 1 ]; then
        npm install
        cd native
        npm run build
        cd ..
    fi
    if [ "$BUILD" -lt 3 ]; then
        npm run build
    fi

    npm run launch -- "$@"

    case $? in
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
            echo "Bad exit code $?"
            exit 1
            ;;
    esac
done
