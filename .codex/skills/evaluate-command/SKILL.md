---
name: evaluate-command
description: Checks that a command file has exactly one top-level default-exported async function reading only args and context.flags and delegating all logic to src/classes, given the command path.
---

# evaluate command

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

1. **llm** — Input: command path

2. **deterministic** — Run .gstudio/artifacts/command/scripts/evaluate/step-2.sh with the command path as space-separated words (e.g. `.gstudio/artifacts/command/scripts/evaluate/step-2.sh compile artifact`) to evaluate the corresponding src/commands/.../*.command.ts file.

3. **llm** — Ensure that the command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome.
