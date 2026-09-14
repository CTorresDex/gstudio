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

total=$(wc -l < "$tmpfile" | tr -d ' ')
discrepancy_found=0
position=0
help_position=0
default_position=0
help_count=0
default_count=0

while IFS='	' read -r lineno snippet; do
  position=$((position + 1))
  normalized=$(printf '%s' "$snippet" | tr -s '[:space:]' ' ')

  case "$normalized" in
    "export const help"*)
      help_count=$((help_count + 1))
      help_position=$position
      if ! printf '%s' "$normalized" | grep -Eq '^export const help[[:space:]]*=[[:space:]]*\{'; then
        echo "Discrepancy: 'help' at line $lineno is not an object literal assigned via 'export const help'. Found: $snippet"
        discrepancy_found=1
      fi
      if ! printf '%s' "$normalized" | grep -Eq "short:[[:space:]]*('[^']*'|\"[^\"]*\")"; then
        echo "Discrepancy: 'help' at line $lineno is missing a 'short' string property."
        discrepancy_found=1
      fi
      if ! printf '%s' "$normalized" | grep -Eq "long:[[:space:]]*('[^']*'|\"[^\"]*\"|\`[^\`]*\`)"; then
        echo "Discrepancy: 'help' at line $lineno is missing a 'long' string property."
        discrepancy_found=1
      fi
      ;;
    "export default"*)
      default_count=$((default_count + 1))
      default_position=$position
      if ! printf '%s' "$normalized" | grep -Eq '^export default async function[[:space:]]*\(args: string\[\], context: \{ flags: Record<string, string \| boolean> \}\)'; then
        echo "Discrepancy: default export at line $lineno does not match the required template signature 'export default async function (args: string[], context: { flags: Record<string, string | boolean> })'. Found: $snippet"
        discrepancy_found=1
      fi
      ;;
    *)
      echo "Discrepancy: unexpected top-level definition at line $lineno (only 'export const help' and the anonymous default exported async function are allowed): $snippet"
      discrepancy_found=1
      ;;
  esac
done < "$tmpfile"

if [ "$total" -ne 2 ]; then
  echo "Discrepancy: expected exactly 2 top-level definitions in $file, found $total."
  discrepancy_found=1
fi

if [ "$help_count" -eq 0 ]; then
  echo "Discrepancy: no 'export const help' object literal found in $file."
  discrepancy_found=1
elif [ "$help_count" -gt 1 ]; then
  echo "Discrepancy: 'export const help' is defined $help_count times in $file; it must be defined exactly once."
  discrepancy_found=1
fi

if [ "$default_count" -eq 0 ]; then
  echo "Discrepancy: no default export function found in $file; expected 'export default async function (args: string[], context: { flags: Record<string, string | boolean> })'."
  discrepancy_found=1
elif [ "$default_count" -gt 1 ]; then
  echo "Discrepancy: the default export is defined $default_count times in $file; it must be defined exactly once."
  discrepancy_found=1
fi

if [ "$help_count" -eq 1 ] && [ "$default_count" -eq 1 ] && [ "$help_position" -gt "$default_position" ]; then
  echo "Discrepancy: 'export const help' must be defined before the default export, but it appears after it in $file."
  discrepancy_found=1
fi

if [ "$discrepancy_found" -eq 1 ]; then
  exit 1
fi

exit 0
