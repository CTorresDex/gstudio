---
name: list-class
description: "Lists all classes in src/classes, optionally filtered by a search term, printing each as class name: file path."
---

# list class

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

1. **llm** — Input (Optional): search term

2. **deterministic** — Run .gstudio/artifacts/class/scripts/list/step-2.sh [search term] to list all classes in the class folder, optionally filtered to those whose name contains the given search term.

3. **llm** — Report the results of the previous command.
