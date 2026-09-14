#!/bin/sh
set -e

path="$1"

if [ -z "$path" ]; then
    echo "Error: command path argument is required" >&2
    exit 1
fi

grep -rn --exclude-dir=.git --exclude-dir=node_modules -F -- "$path" . |
    cut -d: -f1,2
