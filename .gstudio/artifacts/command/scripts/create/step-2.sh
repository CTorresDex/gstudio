#!/bin/sh
set -e

path="$1"

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

cat > "$file" <<'EOF'
export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
EOF

echo "Created $file"
