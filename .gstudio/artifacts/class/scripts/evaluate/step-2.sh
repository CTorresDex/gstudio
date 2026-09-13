#!/bin/sh
set -eu

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

analysis=$(awk '
BEGIN { depth = 0; count = 0; incomment = 0 }
{
    line = $0

    if (incomment) {
        idx = index(line, "*/")
        if (idx == 0) { next }
        line = substr(line, idx + 2)
        incomment = 0
    }

    while ((idx = index(line, "/*")) > 0) {
        rest = substr(line, idx + 2)
        idx2 = index(rest, "*/")
        if (idx2 > 0) {
            line = substr(line, 1, idx - 1) substr(rest, idx2 + 2)
        } else {
            line = substr(line, 1, idx - 1)
            incomment = 1
            break
        }
    }

    idx = index(line, "//")
    if (idx > 0) line = substr(line, 1, idx - 1)

    trimmed = line
    gsub(/^[ \t]+/, "", trimmed)
    gsub(/[ \t]+$/, "", trimmed)

    if (depth == 0 && trimmed != "") {
        if (trimmed !~ /^import\b/ && trimmed !~ /^[)\]};,]+$/) {
            count++
            defs[count] = trimmed
        }
    }

    n = length(line)
    for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        if (c == "{") depth++
        else if (c == "}") depth--
    }
}
END {
    print count
    for (i = 1; i <= count; i++) print defs[i]
}
' "$file")

count=$(printf '%s\n' "$analysis" | head -n 1)
defs=$(printf '%s\n' "$analysis" | tail -n +2)

discrepancies=""

if [ "$count" -ne 1 ]; then
    discrepancies="${discrepancies}Discrepancy: file must have exactly one top-level definition, found ${count}.\n"
else
    def="$defs"
    case "$def" in
        "export class "[A-Za-z_\$]*)
            ;;
        *)
            discrepancies="${discrepancies}Discrepancy: top-level definition must be a named export of a class, found: ${def}\n"
            ;;
    esac
fi

if [ -n "$discrepancies" ]; then
    printf "%b" "$discrepancies"
    exit 1
fi

exit 0
