#!/bin/sh
set -eu

path="${1:-}"

if [ -z "$path" ]; then
    echo "Usage: $0 <path>" >&2
    exit 1
fi

matches=$(grep -rn -F \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=out \
    --exclude-dir=coverage \
    "$path" . 2>/dev/null || true)

if [ -n "$matches" ]; then
    echo "$matches" | sed -E 's#^\./##' | awk -F: '{print $1":"$2}'
fi

exit 0
