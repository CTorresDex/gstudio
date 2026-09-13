#!/bin/sh
set -e

path="$1"

if [ -z "$path" ]; then
  echo "Error: command path is required" >&2
  exit 1
fi

file="src/commands/${path}.command.ts"

if [ ! -f "$file" ]; then
  echo "Error: command file does not exist: $file" >&2
  exit 1
fi

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

awk '
{
  line = $0
  trimmed = line
  gsub(/^[ \t]+/, "", trimmed)
  gsub(/[ \t]+$/, "", trimmed)

  if (instmt == 0) {
    if (incomment == 1) {
      if (trimmed ~ /\*\//) incomment = 0
    } else if (trimmed == "") {
      # blank line, not a statement
    } else if (trimmed ~ /^\/\//) {
      # line comment, not a statement
    } else if (trimmed ~ /^\/\*/) {
      if (trimmed !~ /\*\//) incomment = 1
    } else if (trimmed ~ /^import /) {
      instmt = 1
      isdef = 0
    } else {
      instmt = 1
      isdef = 1
      count++
      startline[count] = NR
      text[count] = trimmed
    }
  } else {
    if (isdef == 1) {
      text[count] = text[count] " " trimmed
    }
  }

  if (incomment == 0) {
    n = length(line)
    for (k = 1; k <= n; k++) {
      c = substr(line, k, 1)
      if (c == "{") depth++
      else if (c == "}") depth--
    }
  }

  if (instmt == 1 && depth == 0) instmt = 0
}
END {
  for (j = 1; j <= count; j++) {
    print startline[j] "\t" text[j]
  }
}
' "$file" > "$tmpfile"

found_default=0
discrepancy_found=0

while IFS='	' read -r lineno snippet; do
  case "$snippet" in
    "export default"*)
      found_default=1
      normalized=$(printf '%s' "$snippet" | tr -s '[:space:]' ' ')
      if printf '%s' "$normalized" | grep -Eq '^export default async function[[:space:]]*\(args: string\[\], context: \{ flags: Record<string, string \| boolean> \}\)'; then
        :
      else
        echo "Discrepancy: default export at line $lineno does not match the required template signature 'export default async function (args: string[], context: { flags: Record<string, string | boolean> })'. Found: $snippet"
        discrepancy_found=1
      fi
      ;;
    *)
      echo "Discrepancy: unexpected top-level definition at line $lineno (only the anonymous default exported async function is allowed): $snippet"
      discrepancy_found=1
      ;;
  esac
done < "$tmpfile"

if [ "$found_default" -eq 0 ]; then
  echo "Discrepancy: no default export function found in $file; expected 'export default async function (args: string[], context: { flags: Record<string, string | boolean> })'."
  discrepancy_found=1
fi

if [ "$discrepancy_found" -eq 1 ]; then
  exit 1
fi

exit 0
