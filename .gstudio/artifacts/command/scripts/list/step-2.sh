#!/bin/sh
set -e

SEARCH_TERM="$1"
COMMANDS_DIR="src/commands"

if [ ! -d "$COMMANDS_DIR" ]; then
  echo "Error: commands directory not found at $COMMANDS_DIR" >&2
  exit 1
fi

find "$COMMANDS_DIR" -type f -name '*.command.ts' | sort | while IFS= read -r file; do
  rel="${file#"$COMMANDS_DIR"/}"
  path="${rel%.command.ts}"

  if [ -z "$SEARCH_TERM" ] || printf '%s' "$path" | grep -qF -- "$SEARCH_TERM"; then
    echo "$path: $file"
  fi
done

exit 0
