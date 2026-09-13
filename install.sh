#!/bin/sh
# Puts gstudio on your PATH. The command is a link to this checkout, not a copy, so pulling the
# repository is how you update: there is nothing to reinstall.
set -e

bin="${GSTUDIO_BIN:-$HOME/.local/bin}"
repo=""

while [ $# -gt 0 ]; do
    case "$1" in
        --bin) bin="$2"; shift 2 ;;
        --bin=*) bin="${1#--bin=}"; shift ;;
        -h|--help) echo "Usage: ./install.sh [--bin <directory>]"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# The checkout this script lives in. Falls back to the working directory when the script is piped in.
case "$0" in
    */*) here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) ;;
    *) here=$(pwd) ;;
esac

if [ -f "$here/index.ts" ] && [ -f "$here/package.json" ]; then
    repo="$here"
elif [ -f "$(pwd)/index.ts" ] && [ -f "$(pwd)/package.json" ]; then
    repo=$(pwd)
else
    echo "Error: run this from a gstudio checkout — the command links to one, so it needs to exist." >&2
    exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
    echo "Error: gstudio runs on bun, which is not installed. See https://bun.sh" >&2
    exit 1
fi

bun install --cwd "$repo" --silent >/dev/null 2>&1 || bun install --silent >/dev/null 2>&1 || true

mkdir -p "$bin"
chmod +x "$repo/index.ts"
ln -sf "$repo/index.ts" "$bin/gstudio"

echo "Installed gstudio -> $repo/index.ts"

case ":$PATH:" in
    *":$bin:"*) echo "Run: gstudio" ;;
    *) echo ""
       echo "$bin is not on your PATH. Add it:"
       echo "  echo 'export PATH=\"$bin:\$PATH\"' >> ~/.zshrc && exec zsh" ;;
esac
