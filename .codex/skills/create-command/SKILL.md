---
name: create-command
description: Scaffolds a new command file at src/commands/{path}.command.ts with an empty or given body, exiting 1 if the file already exists.
---

# create command

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

1. **llm** — Input: command path ({path}) and optionally the content of the command

2. **deterministic** — Run .gstudio/artifacts/command/scripts/create/step-2.sh <path> [content] where <path> is the command's slash-separated path (e.g. create/artifact) and content is an optional string with the command body.

## Evaluation loop

After the steps above, the command must comply with the rules. Verify it with this loop:

1. **llm** — Input: command path ({path})

2. **deterministic** — Run .gstudio/artifacts/command/scripts/evaluate/step-2.sh <path> (e.g. `.gstudio/artifacts/command/scripts/evaluate/step-2.sh create/artifact`), where `<path>` is the command's path exactly as it appears in its file location.

3. **llm** — Ensure that the command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome.

4. **llm** — If every deterministic step of this loop exited 0, the loop is done.
   Otherwise fix every discrepancy they reported, editing the files as located by the rules,
   and restart the loop from its first step. Repeat until every deterministic step exits 0.
