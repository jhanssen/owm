#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$(readlink $0)")" ; pwd )"

BUILD=2
while true; do
    cd $SCRIPTPATH/..
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
            echo "Bad exit copde $?"
            exit 1
            ;;
    esac
done
