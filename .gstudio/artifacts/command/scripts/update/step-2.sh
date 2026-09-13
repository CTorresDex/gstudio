#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
  echo "Error: command path is required" >&2
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
  echo "Error: command path is required" >&2
  exit 1
fi

filepath="$dir/$last.command.ts"

if [ ! -e "$filepath" ]; then
  echo "Error: command file does not exist at $filepath" >&2
  exit 1
fi
