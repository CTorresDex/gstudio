#!/bin/sh
set -eu

search_term="${1:-}"

commands_dir="src/commands"

if [ ! -d "$commands_dir" ]; then
    echo "Error: commands directory not found at $commands_dir" >&2
    exit 1
fi

found_files=$(find "$commands_dir" -type f -name '*.command.ts' | sort)

if [ -z "$found_files" ]; then
    exit 0
fi

echo "$found_files" | while IFS= read -r file_path; do
    rel="${file_path#"$commands_dir"/}"
    command_path="${rel%.command.ts}"

    if [ -n "$search_term" ]; then
        case "$command_path" in
            *"$search_term"*) ;;
            *) continue ;;
        esac
    fi

    echo "${command_path}: ${file_path}"
done
