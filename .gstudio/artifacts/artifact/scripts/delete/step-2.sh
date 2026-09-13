#!/bin/sh
set -eu

name="${1:-}"

if [ -z "$name" ]; then
    echo "Error: artifact name argument is required" >&2
    exit 1
fi

definition=".gstudio/artifacts/${name}/artifact.md"

if [ ! -f "$definition" ]; then
    echo "Error: artifact does not exist: $definition" >&2
    exit 1
fi

rm -rf ".gstudio/artifacts/${name}"
echo "Deleted .gstudio/artifacts/${name}"

for action in create list update delete evaluate; do
    for target in .claude .codex; do
        skill="${target}/skills/${action}-${name}"
        if [ -d "$skill" ]; then
            rm -rf "$skill"
            echo "Deleted $skill"
        fi
    done
done
