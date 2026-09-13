#!/bin/sh
set -e

search_term="$1"
dir="src/classes"

if [ ! -d "$dir" ]; then
    exit 0
fi

for file in "$dir"/*.class.ts; do
    [ -e "$file" ] || continue
    filename=$(basename "$file")
    classname="${filename%.class.ts}"
    if [ -n "$search_term" ]; then
        case "$classname" in
            *"$search_term"*) ;;
            *) continue ;;
        esac
    fi
    echo "$classname: $file"
done
