---
name: delete-command
description: Deletes a command artifact's file at src/commands and removes all dangling references to it found elsewhere in the codebase, given the command path.
---

# delete command

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

2. **deterministic** — Run .gstudio/artifacts/command/scripts/delete/step-2.sh <word1> [word2 ... wordN] where the words together are the command's name (e.g. `.gstudio/artifacts/command/scripts/delete/step-2.sh compile artifact`), with the last word naming the file and any preceding words naming its parent folders.

3. **deterministic** — Run .gstudio/artifacts/command/scripts/delete/step-3.sh <command path words...> (e.g. `.gstudio/artifacts/command/scripts/delete/step-3.sh compile artifact`) to print every reference to that command as `[file path]:[line number]`.

4. **llm** — Remove all the dangling references to the command, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
