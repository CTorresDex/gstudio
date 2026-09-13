#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
    echo "Error: class name is required." >&2
    exit 1
fi

file="src/classes/${name}.class.ts"

if [ ! -e "$file" ]; then
    echo "File does not exist: $file"
    exit 1
fi

analysis=$(awk '
{
    line = $0
    trimmed = line
    gsub(/^[ \t]+/, "", trimmed)
    gsub(/[ \t]+$/, "", trimmed)

    is_blank_or_comment = (trimmed == "" || trimmed ~ /^\/\//)

    if (!is_blank_or_comment && depth == 0 && trimmed !~ /^import[ \t(]/ && trimmed != "import") {
        count++
        defs[count] = trimmed
    }

    opens = gsub(/\{/, "{", line)
    closes = gsub(/\}/, "}", line)
    depth += opens - closes
}
END {
    print count + 0
    for (i = 1; i <= count; i++) {
        print defs[i]
    }
}
' "$file")

count=$(printf "%s\n" "$analysis" | sed -n "1p")
defs=$(printf "%s\n" "$analysis" | sed "1d")

found_issue=0

if [ "$count" -eq 0 ]; then
    echo "No top-level definition found in $file."
    found_issue=1
elif [ "$count" -gt 1 ]; then
    echo "Expected exactly one top-level definition in $file, found $count:"
    printf "%s\n" "$defs" | while IFS= read -r d; do
        [ -n "$d" ] && echo "  - $d"
    done
    found_issue=1
else
    def_line="$defs"
    case "$def_line" in
        "export class "*)
            ;;
        *)
            echo "The top-level definition is not a named export of a class: $def_line"
            found_issue=1
            ;;
    esac
fi

if [ "$found_issue" -eq 1 ]; then
    exit 1
fi

echo "$file has exactly one top-level definition and it is a named export of a class."
exit 0
