---
name: update-class
description: Applies a natural-language change request to an existing class file at src/classes given the class name and description, failing if the file doesn't exist.
---

# update class

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

1. **llm** — Input: <class-name> <change-request>

2. **deterministic** — Run .gstudio/artifacts/class/scripts/update/step-2.sh <class-name> <change-request> to verify the class file exists before applying the update.

3. **llm** — Apply the change request to the content of the class files as located by the rules.
   Edit the files directly so they reflect the requested change while still complying with every rule.

## Evaluation loop

After the steps above, the class must comply with the rules. Verify it with this loop:

1. **llm** — Input: class name

2. **deterministic** — Run .gstudio/artifacts/class/scripts/evaluate/step-2.sh <name> where <name> is the PascalCase class name to evaluate (e.g. `.gstudio/artifacts/class/scripts/evaluate/step-2.sh UserService`).

3. **llm** — Ensure that the functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)

4. **llm** — If every deterministic step of this loop exited 0, the loop is done.
   Otherwise fix every discrepancy they reported, editing the files as located by the rules,
   and restart the loop from its first step. Repeat until every deterministic step exits 0.
