---
name: update-command
description: Applies a natural-language change request to an existing command file at src/commands, given the command path and a description of the change, failing if the command file does not exist
---

# update command

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

1. **llm** — Input: <command-path> <change-request>

2. **deterministic** — Run .gstudio/artifacts/command/scripts/update/step-2.sh <command-path> <change-request>, where `<command-path>` is the space-separated command name (e.g. `"compile artifact"`) and `<change-request>` is ignored by this step but should still be passed as the second argument.

3. **llm** — Apply the change request to the content of the command files as located by the rules.
   Edit the files directly so they reflect the requested change while still complying with every rule.

## Evaluation loop

After the steps above, the command must comply with the rules. Verify it with this loop:

1. **llm** — Input: command path

2. **deterministic** — Run .gstudio/artifacts/command/scripts/evaluate/step-2.sh with the command path as space-separated words (e.g. `.gstudio/artifacts/command/scripts/evaluate/step-2.sh compile artifact`) to evaluate the corresponding src/commands/.../*.command.ts file.

3. **llm** — Ensure that the command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome.

4. **llm** — If every deterministic step of this loop exited 0, the loop is done.
   Otherwise fix every discrepancy they reported, editing the files as located by the rules,
   and restart the loop from its first step. Repeat until every deterministic step exits 0.
