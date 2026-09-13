---
name: update-class
description: Applies a natural-language change request to an existing class file at src/classes/{name}.class.ts, given a class name and change description, erroring if the file doesn't exist.
---

# update class

Every step below is either **deterministic** (run the script exactly as written, from the project root,
and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.
Follow the steps in order.

## Rules

ID: name

1. ALL Classes are defined at src/classes/{name (PascalCase)}.class.ts
2. The file must ONLY have one top level definition and must follow the following template:

```ts
export class {name (PascalCase)} {
    // class definition
}
```

## Steps

1. **llm** — Input: <class-name> <change-request>

2. **deterministic** — Run .gstudio/artifacts/class/scripts/update/step-2.sh <class-name> <change-request> to verify the class file exists before applying the update.

3. **llm** — Apply the change request to the content of the class files as located by the rules.
   Edit the files directly so they reflect the requested change while still complying with every rule.

## Evaluation loop

After the steps above, the class must comply with the rules. Verify it with this loop:

1. **llm** — Input: class name

2. **deterministic** — Run .gstudio/artifacts/class/scripts/evaluate/step-2.sh <class-name> from the project root, where `<class-name>` is the PascalCase class name whose file (`src/classes/<class-name>.class.ts`) should be evaluated.

3. **llm** — If every deterministic step of this loop exited 0, the loop is done.
   Otherwise fix every discrepancy they reported, editing the files as located by the rules,
   and restart the loop from its first step. Repeat until every deterministic step exits 0.
