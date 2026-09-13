#!/bin/sh
set -e

command_path="$1"

if [ -z "$command_path" ]; then
    echo "Error: command path argument is required" >&2
    exit 1
fi

file_path="src/commands/${command_path}.command.ts"

if [ ! -f "$file_path" ]; then
    echo "Error: command file does not exist: $file_path" >&2
    exit 1
fi
