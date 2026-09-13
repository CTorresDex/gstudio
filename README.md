# gstudio

Compiles a codebase's own conventions into agent skills.

An artifact is one document — `.gstudio/artifacts/<name>/artifact.md` — holding the rules for a kind of
file and the actions that operate on it. Read one to learn the format; they are the source of truth.

```bash
bun run index.ts                          # every command there is
bun run index.ts init                     # scaffold .gstudio/artifacts
bun run index.ts compile artifact <name>  # compile one artifact into .claude/ and .codex/ skills
```

Compiling writes a script per deterministic step and a skill per action. It shells out to the `claude`
CLI to write a script, so it is incremental: `compiled.json` keys every step by hash, and only what
changed is rebuilt. `--model` and `--effort` are passed through.

Commands are files: every `src/commands/**/*.command.ts` is one, named by its path. The `command`
artifact governs them, so gstudio compiles the rules it is itself written under.
