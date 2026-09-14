ID: name

1. ALL Classes are defined at src/classes/{name (PascalCase)}.class.ts
2. The file must ONLY have one top level definition and must follow the following template:
3. The functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)

```ts
export class {name (PascalCase)} {
    // class definition
}
```

## create

<llm>Input: class name and optionally the content of the class</llm>
<deterministic>
    Scaffolds the class file as defined at the rules, exits 1 if the file already exists.
</deterministic>

## list

<llm>Input (Optional): search term</llm>
<deterministic>
    Lists all the classes defined in the codebase that contains the search term if provided in the class folder as defined at the rules.
    Every file is a single class.

    The result is printed in the following format:

    [class name]: [file path]
</deterministic>
<llm>
    Report the results of the previous command.
</llm>

## update

<llm>Input: <class-name> <change-request></llm>
<deterministic>
    Exits 1 and prints error message if the class file does not exists.
</deterministic>

## delete

<llm>Input: class name</llm>
<deterministic>
    Removes the class file as defined at the rules, exits 1 if the file does not exists.
</deterministic>
<deterministic>
    Find all the existing references to the class in the codebase and print them to stdout in the following format:

    [file path]:[line number]
</deterministic>
<llm>
    Remove all the dangling references to the class, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
</llm>

## evaluate

<llm>Input: class name</llm>
<deterministic>
    Evaluate that:

    1. The file has ONLY have one top level definition and must be a named export of a class. Only code declares a definition: imports, blank lines and comments — `//` lines as well as `/* */` blocks, including the doc comment above the class — are never definitions and are not counted.

    If it complies with all the rules, exits 0.
    Otherwise, iterate over each discrepancy, print them to stdout and exit with 1.
</deterministic>
<llm>
    Ensure that the functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)
</llm>