#!/bin/sh

name="$1"

if [ -z "$name" ]; then
    echo "Error: class name is required." >&2
    exit 1
fi

matches=$(grep -rn -w \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    "$name" . 2>/dev/null)

if [ -n "$matches" ]; then
    echo "$matches" | sed -E 's#^\./##' | awk -F: '{print $1":"$2}'
fi

exit 0
