#!/bin/sh
set -e

path="$1"

if [ -z "$path" ]; then
    echo "Error: command path argument is required" >&2
    exit 1
fi

grep -rn -F --exclude-dir=.git --exclude-dir=node_modules -- "$path" . |
    sed -E 's#^\./##' |
    awk -F: '{print $1":"$2}'

exit 0
