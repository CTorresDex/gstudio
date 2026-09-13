---
name: evaluate-class
description: Verifies that a given class name's file contains exactly one top-level definition, a named class export, reporting each violation and exiting nonzero if any are found.
---

# evaluate class

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

1. **llm** — Input: class name

2. **deterministic** — Run .gstudio/artifacts/class/scripts/evaluate/step-2.sh <class-name> from the project root, where `<class-name>` is the PascalCase class name whose file (`src/classes/<class-name>.class.ts`) should be evaluated.
