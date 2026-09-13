ID: path

1. ALL Commands are defined at src/commands/{path}.command.ts, where the path is the command name with every word but the last one as a folder (the `compile artifact` command is defined at src/commands/compile/artifact.command.ts)
2. The file must ONLY have one top level definition, the anonymous default exported command function, and must follow the following template:
3. A command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome: no types, no helper functions and no variables are defined at the top level of the file

```ts
export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    // command definition
}
```

## create

<llm>Input: command path and optionally the content of the command</llm>
<deterministic>
    Scaffolds the command file as defined at the rules, exits 1 if the file already exists.
</deterministic>

## list

<llm>Input (Optional): search term</llm>
<deterministic>
    Lists all the commands defined in the codebase that contains the search term if provided in the commands folder as defined at the rules.
    Every file is a single command.

    The result is printed in the following format:

    [command path]: [file path]
</deterministic>
<llm>
    Report the results of the previous command.
</llm>

## update

<llm>Input: <command-path> <change-request></llm>
<deterministic>
    Exits 1 and prints error message if the command file does not exists.
</deterministic>

## delete

<llm>Input: command path</llm>
<deterministic>
    Removes the command file as defined at the rules, exits 1 if the file does not exists.
</deterministic>
<deterministic>
    Find all the existing references to the command in the codebase and print them to stdout in the following format:

    [file path]:[line number]
</deterministic>
<llm>
    Remove all the dangling references to the command, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
</llm>

## evaluate

<llm>Input: command path</llm>
<deterministic>
    Evaluate that:

    1. The file has ONLY have one top level definition and must be the anonymous default export of an async function taking the arguments of the template at the rules.

    If it complies with all the rules, exits 0.
    Otherwise, iterate over each discrepancy, print them to stdout and exit with 1.
</deterministic>
<llm>
    Ensure that the command only reads its input from args and context.flags, delegates every decision to the classes at src/classes and prints the outcome.
</llm>
