#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$0")" ; pwd -P )"

while true; do
    cd $SCRIPTPATH/..
    npm install
    cd native
    npm run build
    cd ..
    npm run start -- "$@"
    if [ $? -eq 0 ]; then
        break
    fi
done
