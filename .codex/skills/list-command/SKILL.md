---
name: list-command
description: "Lists all commands in src/commands matching an optional search term, printing each as \"command path: file path\"."
---

# list command

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: path

1. ALL Commands are defined at src/commands/{path}.command.ts, where the path is the command name with every word but the last one as a folder (the `compile artifact` command is defined at src/commands/compile/artifact.command.ts)
2. The file must ONLY have one top level definition, the anonymous default exported command function, and must follow the following template:
3. A command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome: no types, no helper functions and no variables are defined at the top level of the file

```ts
export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
```

## Steps

1. **llm** — Input (Optional): search term

2. **deterministic** — Run the script as `.gstudio/artifacts/command/scripts/list/step-2.sh [search term]`, omitting the argument to list every command.

3. **llm** — Report the results of the previous command.
