#!/bin/sh
set -e

search_term="$1"

commands_dir="src/commands"

if [ ! -d "$commands_dir" ]; then
    echo "Error: commands directory '$commands_dir' not found" >&2
    exit 1
fi

find "$commands_dir" -type f -name '*.command.ts' | sort | while IFS= read -r file; do
    rel="${file#"$commands_dir"/}"
    rel="${rel%.command.ts}"
    command_path=$(printf '%s' "$rel" | tr '/' ' ')

    if [ -z "$search_term" ] || printf '%s' "$command_path" | grep -qF -- "$search_term"; then
        printf '%s: %s\n' "$command_path" "$file"
    fi
done
