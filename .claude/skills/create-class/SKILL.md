---
name: create-class
description: Scaffolds a new class file at src/classes/{Name}.class.ts with an empty or given body, failing if the file already exists.
---

# create class

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: name

1. ALL Classes are defined at src/classes/{name (PascalCase)}.class.ts
2. The file must ONLY have one top level definition and must follow the following template:
3. The functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)

```ts
export class {name (PascalCase)} {
    // class definition
}
```

## Steps

1. **llm** — Input: class name and optionally the content of the class

2. **deterministic** — Run .gstudio/artifacts/class/scripts/create/step-2.sh <name> [content] where <name> is the PascalCase class name and the optional [content] is the class body text.

## Evaluation loop

After the steps above, the class must comply with the rules. Verify it with this loop:

1. **llm** — Input: class name

2. **deterministic** — Run `.gstudio/artifacts/class/scripts/evaluate/step-2.sh <name>` where `<name>` is the PascalCase class name (matching its file at src/classes/<name>.class.ts) to evaluate.

3. **llm** — Ensure that the functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)

4. **llm** — If every deterministic step of this loop exited 0, the loop is done.
   Otherwise fix every discrepancy they reported, editing the files as located by the rules,
   and restart the loop from its first step. Repeat until every deterministic step exits 0.
