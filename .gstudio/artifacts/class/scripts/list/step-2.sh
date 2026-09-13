#!/bin/sh
set -eu

search_term="${1:-}"
classes_dir="src/classes"

if [ ! -d "$classes_dir" ]; then
    exit 0
fi

for file in "$classes_dir"/*.class.ts; do
    [ -e "$file" ] || continue

    filename=$(basename "$file")
    class_name="${filename%.class.ts}"

    if [ -n "$search_term" ]; then
        case "$class_name" in
            *"$search_term"*) ;;
            *) continue ;;
        esac
    fi

    echo "${class_name}: ${file}"
done
