---
name: delete-command
description: Deletes a command's file at src/commands given its path, then finds and removes all dangling references to it in the codebase.
---

# delete command

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

1. **llm** — Input: command path ({path})

2. **deterministic** — Run .gstudio/artifacts/command/scripts/delete/step-2.sh <path> where <path> is the slash-separated command path (e.g. create/artifact).

3. **deterministic** — Run .gstudio/artifacts/command/scripts/delete/step-3.sh <path> where <path> is the command's slash-separated path (e.g. create/artifact) to list every file:line reference to that command found in the codebase.

4. **llm** — Remove all the dangling references to the command, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
