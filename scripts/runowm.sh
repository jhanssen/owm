#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"

BUILD=1
while true; do
    cd $SCRIPTPATH/..
    if [ "$BUILD" = 1 ]; then
        npm install
        cd native
        npm run build
        cd ..
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
        *)
            echo "Bad exit copde $?"
            exit 1
            ;;
    esac
done
