#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
    echo "Error: class name is required." >&2
    exit 1
fi

file="src/classes/${name}.class.ts"

if [ ! -e "$file" ]; then
    echo "Error: file does not exist: $file" >&2
    exit 1
fi

rm "$file"

echo "Deleted $file"
