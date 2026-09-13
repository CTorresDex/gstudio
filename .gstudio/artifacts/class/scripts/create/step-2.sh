#!/bin/sh
set -e

name="$1"
content="$2"

if [ -z "$name" ]; then
  echo "Error: class name is required" >&2
  exit 1
fi

file="src/classes/${name}.class.ts"

if [ -e "$file" ]; then
  echo "Error: class file already exists at $file" >&2
  exit 1
fi

mkdir -p "$(dirname "$file")"

{
  echo "export class ${name} {"
  if [ -n "$content" ]; then
    printf '%s\n' "$content"
  else
    echo '    // class definition'
  fi
  echo '}'
} > "$file"

echo "Created $file"
