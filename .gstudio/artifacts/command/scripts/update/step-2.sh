#!/bin/sh
set -e

path="$1"
file="src/commands/${path}.command.ts"

if [ ! -f "$file" ]; then
  echo "Error: command file does not exist: $file" >&2
  exit 1
fi
