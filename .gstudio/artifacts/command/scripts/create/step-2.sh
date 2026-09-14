#!/bin/sh
set -e

path="$1"

if [ -z "$path" ]; then
    echo "Error: command path argument is required" >&2
    exit 1
fi

file="src/commands/${path}.command.ts"

if [ -e "$file" ]; then
    echo "Error: command file already exists: ${file}" >&2
    exit 1
fi

dir=$(dirname "$file")
mkdir -p "$dir"

cat > "$file" <<EOF
export const help = {
    short: 'What the command does, in one line',
    long: \`Usage: gstudio ${path} <args> [--flags]

What the command does.

Arguments:
  <args>     what it is

Flags:
  --flag     what it does\`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
EOF

echo "Created ${file}"
