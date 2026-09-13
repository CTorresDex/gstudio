#!/bin/sh
set -e

path="$1"
content="$2"

if [ -z "$path" ]; then
  echo "Error: command path is required" >&2
  exit 1
fi

file="src/commands/${path}.command.ts"

if [ -e "$file" ]; then
  echo "Error: command file already exists at $file" >&2
  exit 1
fi

mkdir -p "$(dirname "$file")"

{
  echo "export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {"
  if [ -n "$content" ]; then
    printf '%s\n' "$content"
  else
    echo '    // command definition'
  fi
  echo '}'
} > "$file"

echo "Created $file"
