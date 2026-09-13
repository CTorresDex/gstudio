#!/bin/sh
set -e

name="$1"
content="$2"

if [ -z "$name" ]; then
  echo "Error: command name is required" >&2
  exit 1
fi

dir="src/commands"
prev=""
for word in $name; do
  if [ -n "$prev" ]; then
    dir="$dir/$prev"
  fi
  prev="$word"
done
last="$prev"

if [ -z "$last" ]; then
  echo "Error: command name is required" >&2
  exit 1
fi

filepath="$dir/$last.command.ts"

if [ -e "$filepath" ]; then
  echo "Error: command file already exists at $filepath" >&2
  exit 1
fi

mkdir -p "$dir"

{
  echo 'export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {'
  if [ -n "$content" ]; then
    printf '%s\n' "$content"
  else
    echo '    // command definition'
  fi
  echo '}'
} > "$filepath"

echo "Created $filepath"
