---
name: list-command
description: "Lists all commands in src/commands matching an optional search term, printing each as \"command path: file path\""
---

# list command

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: path

1. ALL Commands are defined at src/commands/{path}.command.ts, where {path} is slash separated and is substituted verbatim into that location: the `create artifact` command has the path create/artifact and is defined at src/commands/create/artifact.command.ts
2. The file must ONLY have one top level definition, the anonymous default exported command function, and must follow the following template:
3. A command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome: no types, no helper functions and no variables are defined at the top level of the file
4. Every script receives {path} as a single first argument, written exactly as it appears in the file location (create/artifact), never split into separate words and never needing quotes

```ts
export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
```

## Steps

1. **llm** — Input (Optional): search term

2. **deterministic** — Run .gstudio/artifacts/command/scripts/list/step-2.sh [search_term] to list commands, optionally filtering to those whose command path or file path contains the given search term.

3. **llm** — Report the results of the previous command.
