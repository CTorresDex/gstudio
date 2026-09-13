#!/bin/sh
set -e

name="$1"
content="$2"

if [ -z "$name" ]; then
    echo "Error: class name is required." >&2
    exit 1
fi

file="src/classes/${name}.class.ts"

if [ -e "$file" ]; then
    echo "Error: file already exists: $file" >&2
    exit 1
fi

mkdir -p "$(dirname "$file")"

if [ -n "$content" ]; then
    body="$content"
else
    body="    // class definition"
fi

cat > "$file" <<EOF
export class ${name} {
${body}
}
EOF

echo "Created $file"
