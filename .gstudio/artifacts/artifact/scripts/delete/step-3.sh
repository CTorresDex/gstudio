#!/bin/sh
set -eu

name="${1:-}"

if [ -z "$name" ]; then
    echo "Error: artifact name argument is required" >&2
    exit 1
fi

patterns=".gstudio/artifacts/${name}"

for action in create list update delete evaluate; do
    patterns="${patterns}
${action}-${name}"
done

printf '%s\n' "$patterns" | grep -rn -F \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=out \
    --exclude-dir=coverage \
    -f - . 2>/dev/null | awk -F: '{print $1":"$2}'

exit 0
