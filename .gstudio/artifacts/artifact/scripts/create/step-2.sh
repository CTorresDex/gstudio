#!/bin/sh
set -e

name="$1"

if [ -z "$name" ]; then
    echo "Error: artifact name is required" >&2
    exit 1
fi

file=".gstudio/artifacts/${name}/artifact.md"

if [ -e "$file" ]; then
    echo "Error: artifact definition already exists at $file" >&2
    exit 1
fi

mkdir -p "$(dirname "$file")"

cat > "$file" <<'EOF'
ID: {id}

1. ALL {Name}s are defined at {location}, where {id} is {what identifies one}
2. {what every instance must look like}
3. Every script receives {id} as its single first argument

## create

<llm>Input: {id} and optionally the content of the {name}</llm>
<deterministic>
    Scaffolds the {name} as defined at the rules, exits 1 if it already exists.
</deterministic>

## list

<llm>Input (Optional): search term</llm>
<deterministic>
    Lists all the {name}s defined in the codebase that contain the search term if provided, as located by the rules.

    The result is printed in the following format:

    [{id}]: [file path]
</deterministic>
<llm>
    Report the results of the previous command.
</llm>

## update

<llm>Input: <{id}> <change-request></llm>
<deterministic>
    Exits 1 and prints error message if the {name} does not exist.
</deterministic>

## delete

<llm>Input: {id}</llm>
<deterministic>
    Removes the {name} as defined at the rules, exits 1 if it does not exist.
</deterministic>
<deterministic>
    Find all the existing references to the {name} in the codebase and print them to stdout in the following format:

    [file path]:[line number]
</deterministic>
<llm>
    Remove all the dangling references to the {name}, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
</llm>

## evaluate

<llm>Input: {id}</llm>
<deterministic>
    Evaluate that:

    1. {a rule a script can settle}

    If it complies with all the rules, exits 0.
    Otherwise, iterate over each discrepancy, print them to stdout and exit with 1.
</deterministic>
<llm>
    {a rule that needs judgement}
</llm>
EOF

sed -i.bak "s/{name}/${name}/g" "$file" && rm -f "${file}.bak"

echo "Created $file"
