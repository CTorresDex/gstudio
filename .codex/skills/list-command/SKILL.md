---
name: list-command
description: Lists commands in src/commands matching an optional search term and prints each as command path plus file path.
---

# list command

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: path

1. ALL Commands are defined at src/commands/{path}.command.ts, where {path} is slash separated and is substituted verbatim into that location: the `create artifact` command has the path create/artifact and is defined at src/commands/create/artifact.command.ts
2. The file must have EXACTLY two top level definitions, in this order: the named `help` const export and the anonymous default exported command function, and must follow the following template
3. `help.short` is a single line without a trailing period, shown for the command in the general listing printed by `gstudio help` and by `gstudio` with no arguments; `help.long` is a multi-line string shown by `gstudio help {path}`, opening with the usage line `Usage: gstudio {path} <args> [--flags]`, then what the command does, its arguments and its flags
4. A command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome: no types, no helper functions and no variables other than `help` are defined at the top level of the file
5. Every script receives {path} as a single first argument, written exactly as it appears in the file location (create/artifact), never split into separate words and never needing quotes

```ts
export const help = {
    short: 'What the command does, in one line',
    long: `Usage: gstudio {path} <args> [--flags]

What the command does.

Arguments:
  <args>     what it is

Flags:
  --flag     what it does`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
```

## Steps

1. **llm** — Input (Optional): search term

2. **deterministic** — Run .gstudio/artifacts/command/scripts/list/step-2.sh [search term] with an optional search term argument to filter the listed commands by path.

3. **llm** — Report the results of the previous command.
