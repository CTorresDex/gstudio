#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
    echo "Error: artifact name argument is required" >&2
    exit 1
fi

file=".gstudio/artifacts/${name}/artifact.md"

if [ ! -f "$file" ]; then
    echo "Error: artifact definition file does not exist: $file" >&2
    exit 1
fi
