#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
    echo "Error: missing required argument <command-path>" >&2
    exit 1
fi

command_path="$1"
file="src/commands/${command_path}.command.ts"

if [ ! -f "$file" ]; then
    echo "Error: command file does not exist: ${file}" >&2
    exit 1
fi
