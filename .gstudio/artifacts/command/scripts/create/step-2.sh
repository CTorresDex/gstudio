#!/bin/sh
set -e

path="$1"
content="$2"

if [ -z "$path" ]; then
    echo "Error: missing command path" >&2
    exit 1
fi

file="src/commands/${path}.command.ts"

if [ -e "$file" ]; then
    echo "Error: command already exists at $file" >&2
    exit 1
fi

mkdir -p "$(dirname "$file")"

if [ -n "$content" ]; then
    printf '%s\n' "$content" > "$file"
else
    cat > "$file" <<EOF
export const help = {
    short: 'TODO: describe the command in one line',
    long: \`Usage: gstudio ${path} <args> [--flags]

TODO: describe what the command does.

Arguments:
  <args>     TODO: describe the arguments

Flags:
  --flag     TODO: describe the flags\`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
}
EOF
fi

echo "Created $file"
