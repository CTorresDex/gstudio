---
name: list-class
description: Lists all classes in src/classes, optionally filtered by a search term, showing each class name and its file path.
---

# list class

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

1. **llm** — Input (Optional): search term

2. **deterministic** — Run .gstudio/artifacts/class/scripts/list/step-2.sh [search_term], where the optional search_term filters classes whose name contains it.

3. **llm** — Report the results of the previous command.
