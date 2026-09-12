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