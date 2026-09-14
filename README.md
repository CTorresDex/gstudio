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

## Templates and features

A template lays a project down; a feature lands on a project that already exists. Both travel in a
source — a git repository, or a directory on this machine — and are installed into a registry that
addresses everything as `alias/name`, with a bare `name` as a shortcut while only one source provides it.

```bash
bun run index.ts install template <git-url> [--as <alias>]   # index a source: its templates and its features
bun run index.ts init <template>                             # lay a template down here
bun run index.ts add feature <feature>                       # put a feature, and what it requires, into this project
bun run index.ts remove feature <name>                       # take it out, and whatever only it needed
bun run index.ts update feature <name>                       # bring it to what its source now says
bun run index.ts list feature                                # what is installed here, and what sources provide
```

A source is a catalog — `gstudio.json` naming where its templates and features live — or a single one,
with `template.json` or `feature.json` at its root. Where a feature sits in the repository is its
author's business; it is named by its manifest, so it can move without anyone noticing.

A feature is a directory:

```
feature.json      name, version, and the features it requires
feature.md        rules, then ## requires, ## install, ## uninstall — steps, as an artifact's actions are
scaffolding/      laid over the project as it is, refused if any file already exists
artifacts/        artifact definitions the project gains, compiled into skills as it takes them
```

Adding a feature is a transaction: the graph of what it requires is closed first, every `requires`
step runs, every file and artifact is checked for a collision — and only then is anything written.
A `<deterministic>` step runs its compiled script; an `<llm>` step runs an agent, which looks around
for `requires` and edits the project for `install` and `uninstall`. The project records what each
feature wrote in `.gstudio/project.json`, with a hash per file, so removing gives back exactly what is
untouched and updating replaces what is untouched, reconciles what you edited, and leaves what you
deleted deleted. A feature installed because another required it goes when the last of them goes.

Compile a feature where it is written — `compile feature <name>` from its source's root — and the
scripts and skill descriptions travel with it, so installing it costs no llm call already paid.
`GSTUDIO_HOME` moves the registry and the cache, for a CI job or a test.
