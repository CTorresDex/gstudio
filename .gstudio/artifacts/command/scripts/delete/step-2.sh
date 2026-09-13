#!/bin/sh
set -eu

path="${1:-}"

if [ -z "$path" ]; then
    echo "Usage: $0 <path>" >&2
    exit 1
fi

file="src/commands/${path}.command.ts"

if [ ! -f "$file" ]; then
    echo "Command file does not exist: $file" >&2
    exit 1
fi

rm "$file"
echo "Removed $file"
