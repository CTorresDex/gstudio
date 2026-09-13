---
name: evaluate-artifact
description: Checks that an artifact's definition file, parsing, action ordering, and compiled outputs match the compiler's expectations, given the artifact name as input.
---

# evaluate artifact

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: name

1. ALL Artifacts are defined at .gstudio/artifacts/{name}/artifact.md, where {name} is a single lowercase word naming the kind of file the artifact governs: the `command` artifact is defined at .gstudio/artifacts/command/artifact.md
2. The definition is parsed by src/classes/Artifact.class.ts and compiled by src/classes/ArtifactCompiler.class.ts: running `bun run index.ts compile artifact {name}` from the project root writes one script per deterministic step at .gstudio/artifacts/{name}/scripts/{action}/step-{n}.{ext} ({n} is the 1-based position of the step in its action, {ext} is sh unless the step declares another language), a manifest at .gstudio/artifacts/{name}/compiled.json keyed by the hash of every step and action, and one skill per action at .claude/skills/{action}-{name}/SKILL.md and .codex/skills/{action}-{name}/SKILL.md
3. The definition opens with the rules: a preamble whose first line is `ID: {id}`, naming the input every action identifies an instance by, followed by a numbered list stating where the instances live, what every instance must look like and what every script receives as input, optionally followed by a fenced code block with the template of an instance
4. After the rules, the definition has at most one `## {action}` section per action, where {action} is one of create, list, update, delete or evaluate, and no other line of the document may start with `## `
5. The body of every section consists ONLY of `<llm>...</llm>` and `<deterministic>...</deterministic>` steps in order, with nothing outside the tags: an llm step is an input or a judgement the agent resolves itself, a deterministic step is a task a script settles from its arguments alone, and a deterministic step may declare its language as `<deterministic lang="ts">` (sh by default)
6. The first step of every action is an `<llm>` step stating the input, and the evaluate action prints every discrepancy to stdout and exits 1, or exits 0 when the instance complies, because the compiler appends it as the evaluation loop of create and update
7. Every script receives {name} as its single first argument
8. The definition must follow the following template, shown indented only so its headings are not parsed as sections of this document (a real definition is not indented):

```md
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
```

## Steps

1. **llm** — Input: artifact name ({name})

2. **deterministic** — Run `.gstudio/artifacts/artifact/scripts/evaluate/step-2.ts <name>` to evaluate whether the artifact named `<name>` complies with the rules and is fully compiled, printing any discrepancies to stdout and exiting 1, or printing a success message and exiting 0 when it complies.

3. **llm** — Ensure that every deterministic step describes something a script can settle from its arguments alone and every llm step something that needs judgement, and that the rules are enough for the compiler to locate and shape every instance without guessing.
   If the previous step reported the artifact as not compiled or out of date, compile it as defined at the rules.
