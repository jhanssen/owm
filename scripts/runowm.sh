#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"

while true; do
    cd $SCRIPTPATH/..
    npm run start -- "$@"
    if [ $? -eq 0 ]; then
        break
    fi
done
