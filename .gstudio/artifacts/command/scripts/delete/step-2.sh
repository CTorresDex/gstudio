#!/bin/sh
set -e

if [ "$#" -eq 0 ]; then
    echo "Error: command path is required" >&2
    exit 1
fi

words="$#"
i=1
folders=""
filename=""
for word in "$@"; do
    if [ "$i" -eq "$words" ]; then
        filename="$word"
    else
        if [ -z "$folders" ]; then
            folders="$word"
        else
            folders="$folders/$word"
        fi
    fi
    i=$((i + 1))
done

if [ -n "$folders" ]; then
    file_path="src/commands/$folders/$filename.command.ts"
else
    file_path="src/commands/$filename.command.ts"
fi

if [ ! -f "$file_path" ]; then
    echo "Error: command file does not exist: $file_path" >&2
    exit 1
fi

rm "$file_path"
echo "Deleted: $file_path"
