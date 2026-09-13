---
name: evaluate-class
description: Checks that a class file has exactly one top-level named class export and that it contains no general-purpose utility functions, given the class name.
---

# evaluate class

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

2. **deterministic** — Run .gstudio/artifacts/class/scripts/evaluate/step-2.sh <name> where <name> is the class name (PascalCase) whose file src/classes/<name>.class.ts should be evaluated.

3. **llm** — Evaluate that:
       1. The functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)
