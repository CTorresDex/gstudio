#!/bin/sh
set -e

path="$1"

if [ -z "$path" ]; then
    echo "Error: command path argument is required" >&2
    exit 1
fi

file="src/commands/${path}.command.ts"

if [ ! -f "$file" ]; then
    echo "Error: command file does not exist: $file" >&2
    exit 1
fi

rm "$file"
echo "Deleted $file"
