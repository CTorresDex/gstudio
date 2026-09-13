---
name: delete-class
description: Deletes a class artifact's file at src/classes and removes all dangling references to it found elsewhere in the codebase, given the class name.
---

# delete class

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

1. **llm** — Input: class name

2. **deterministic** — Run .gstudio/artifacts/class/scripts/delete/step-2.sh <name> to delete the class file at src/classes/<name>.class.ts, exiting 1 if the file does not exist.

3. **deterministic** — Run `.gstudio/artifacts/class/scripts/delete/step-3.sh <name>` where `<name>` is the PascalCase class name to search for references of.

4. **llm** — Remove all the dangling references to the class, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
