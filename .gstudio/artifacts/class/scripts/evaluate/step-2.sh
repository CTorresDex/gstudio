#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
  echo "Error: class name is required" >&2
  exit 1
fi

file="src/classes/${name}.class.ts"

if [ ! -f "$file" ]; then
  echo "Error: class file does not exist: $file" >&2
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
      # blank line, not a definition
    } else if (trimmed ~ /^\/\//) {
      # line comment, not a definition
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

total=0
discrepancy_found=0

while IFS='	' read -r lineno snippet; do
  total=$((total + 1))
  if [ "$total" -eq 1 ]; then
    normalized=$(printf '%s' "$snippet" | tr -s '[:space:]' ' ')
    if printf '%s' "$normalized" | grep -Eq '^export class [A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*(extends[^{]+)?(implements[^{]+)?\{'; then
      :
    else
      echo "Discrepancy: top-level definition at line $lineno is not a named class export: $snippet"
      discrepancy_found=1
    fi
  else
    echo "Discrepancy: unexpected additional top-level definition at line $lineno (only one top-level definition is allowed): $snippet"
    discrepancy_found=1
  fi
done < "$tmpfile"

if [ "$total" -eq 0 ]; then
  echo "Discrepancy: no top-level definition found in $file; expected a named class export."
  discrepancy_found=1
fi

if [ "$discrepancy_found" -eq 1 ]; then
  exit 1
fi

exit 0
