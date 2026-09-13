#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
    echo "Error: class name is required." >&2
    exit 1
fi

grep -rn -w \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    "$name" . | awk -F: '{print $1":"$2}'
