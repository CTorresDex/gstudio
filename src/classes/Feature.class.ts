import { cp, mkdir, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Agent } from './Agent.class.ts'
import { Artifact } from './Artifact.class.ts'
import { ArtifactCompiler } from './ArtifactCompiler.class.ts'
import { StepCompiler } from './StepCompiler.class.ts'
import { StepDocument } from './StepDocument.class.ts'
import { StringUtils } from './StringUtils.class'
import { TemplateSource } from './TemplateSource.class.ts'

/**
 * One feature: something a project can take on after it exists. A template lays a project down and
 * can copy without thinking; a feature lands on a project that has been edited since, so beside what
 * it copies — `scaffolding/`, laid over the project, and `artifacts/`, each one an artifact definition
 * the project gains — it carries `feature.md`: what the project must have, how the feature is wired in
 * and how it is taken out, as steps a script settles or an agent judges, the way an artifact is written.
 */
export class Feature {
    /** Where a project keeps the features installed in it: each one's document and scripts, never its overlay. */
    static readonly ROOT = '.gstudio/features'
    static readonly MANIFEST = TemplateSource.KINDS.feature.manifest
    static readonly DEFINITION = 'feature.md'
    static readonly SCAFFOLDING = 'scaffolding'
    static readonly ARTIFACTS = 'artifacts'
    /** The closed vocabulary: what a project must have, how the feature goes in, how it comes out. */
    static readonly VERBS = ['requires', 'install', 'uninstall'] as const
    /** Files that hold a directory together but mean nothing in a project. */
    static readonly INTERNAL = ['.gitkeep', '.DS_Store']
    /** The scaffold a fresh document is written with, ready for its author to replace every placeholder. */
    static readonly TEMPLATE = StringUtils.dedent(`
        1. {what the feature adds to a project, and where: name every file and path the actions below refer to, because each action is compiled on its own and sees only these rules}
        2. {what a project must already have for it}
        3. Every script runs in the root of the project, with no arguments

        ## requires

        <deterministic>
            Checks that {what a script can settle: a file, a dependency, a directory}. Prints what is missing and exits 1, or exits 0.
        </deterministic>
        <llm>
            {what needs judgement: that nothing already plays this role in the project}
        </llm>

        ## install

        <deterministic>
            {what a script can settle: adding a dependency, creating a directory}
        </deterministic>
        <llm>
            {what needs judgement: wiring the feature into code the project may have moved since it was generated}
        </llm>

        ## uninstall

        <llm>
            {undoing the wiring; the files the feature wrote are taken back by gstudio itself}
        </llm>
    `)

    private constructor(
        readonly name: string,
        readonly version: string | null,
        readonly description: string | null,
        /** The features it requires, as references: bare names first mean a sibling in the same source. */
        readonly requires: string[],
        /** Its steps, or null when it has none and is only what it copies. */
        readonly document: StepDocument | null,
        /** Where it sits: inside a fetched source, or installed inside a project. */
        readonly path: string,
    ) {}

    /** Where a feature of this name sits in a project, and where its scripts are keyed. */
    static prefix(name: string): string {
        return `${Feature.ROOT}/${name}`
    }

    /** Writes an empty feature: the manifest that names it, the document to fill in, and the two directories it may copy from. */
    static async scaffold(name: string, target: string): Promise<string> {
        if ((await readdir(target).catch(() => null)) !== null) throw new Error(`${target} already exists`)

        await mkdir(join(target, Feature.SCAFFOLDING), { recursive: true })
        await mkdir(join(target, Feature.ARTIFACTS), { recursive: true })
        await Bun.write(join(target, Feature.MANIFEST), `${JSON.stringify({ name, version: '0.1.0', description: '', requires: [] }, null, 4)}\n`)
        await Bun.write(join(target, Feature.DEFINITION), `${Feature.TEMPLATE}\n`)
        await Bun.write(join(target, Feature.SCAFFOLDING, '.gitkeep'), '')
        await Bun.write(join(target, Feature.ARTIFACTS, '.gitkeep'), '')

        return target
    }

    /** Reads the feature sitting in a directory, wherever that is. */
    static async at(path: string): Promise<Feature> {
        const manifest = await Bun.file(join(path, Feature.MANIFEST)).json().catch(() => null)

        if (manifest === null || typeof manifest.name !== 'string' || manifest.name === '') throw new Error(`${path} is not a feature: it has no ${Feature.MANIFEST} naming one`)

        const definition = Bun.file(join(path, Feature.DEFINITION))
        const document = (await definition.exists()) ? StepDocument.parse('Feature', manifest.name, await definition.text(), Feature.VERBS) : null
        const requires = Array.isArray(manifest.requires) ? manifest.requires.filter((entry: unknown): entry is string => typeof entry === 'string') : []

        return new Feature(manifest.name, typeof manifest.version === 'string' ? manifest.version : null, typeof manifest.description === 'string' ? manifest.description : null, requires, document, path)
    }

    /** Reads the feature of this name out of a fetched source, or its only one when the source has just one. */
    static async read(source: TemplateSource, name: string | null = null): Promise<Feature> {
        const features = await source.features()
        const chosen = name ?? (features.size === 1 ? [...features.keys()][0]! : null)

        if (chosen === null)
            throw new Error(`${source.url} is a catalog of ${features.size} features, so it cannot be added directly. Install it, then add one by name:\n  gstudio install template ${source.url}\n  gstudio add feature <name>`)

        const path = features.get(chosen)

        if (path === undefined) throw new Error(`${source.url} does not provide the feature ${chosen}. It provides: ${[...features.keys()].join(', ') || 'nothing'}`)

        return await Feature.at(path)
    }

    /** Every file the feature lays over a project, as the project will see it and as it sits here. */
    async overlay(): Promise<{ relative: string; absolute: string }[]> {
        const root = join(this.path, Feature.SCAFFOLDING)
        const files: { relative: string; absolute: string }[] = []
        const walk = async (dir: string): Promise<void> => {
            for (const entry of (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
                if (Feature.INTERNAL.includes(entry.name)) continue

                const absolute = join(dir, entry.name)

                if (entry.isDirectory()) await walk(absolute)
                else files.push({ relative: absolute.slice(root.length + 1), absolute })
            }
        }

        await walk(root)

        return files
    }

    /** Every artifact the feature brings, named by its directory as the artifact rules name it. */
    async artifacts(): Promise<{ name: string; path: string }[]> {
        const root = join(this.path, Feature.ARTIFACTS)
        const found: { name: string; path: string }[] = []

        for (const entry of (await readdir(root, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory()) continue
            if (!(await Bun.file(join(root, entry.name, Artifact.DEFINITION)).exists())) throw new Error(`${this.name}'s artifact ${entry.name} has no ${Artifact.DEFINITION}`)

            found.push({ name: entry.name, path: join(root, entry.name) })
        }

        return found
    }

    /** Copies the feature's own files — manifest, document, scripts — somewhere, leaving behind what it copies elsewhere. */
    async copy(target: string): Promise<void> {
        await mkdir(target, { recursive: true })
        await cp(this.path, target, {
            recursive: true,
            filter: (source) => !Feature.INTERNAL.includes(basename(source)) && !(dirname(source) === this.path && [Feature.SCAFFOLDING, Feature.ARTIFACTS].includes(basename(source))),
        })
    }

    /**
     * Runs one action's steps in order, in a project: a deterministic step runs its compiled script,
     * an llm step runs an agent — one that only looks, for `requires`, and one that acts otherwise.
     * The first step that fails stops the action; a step that does not say it finished has failed.
     */
    async run(verb: (typeof Feature.VERBS)[number], { cwd, agent, log = () => {} }: { cwd: string; agent: Agent; log?: (line: string) => void }): Promise<void> {
        const section = this.document?.section(verb)

        if (section === undefined) return

        for (const [index, step] of section.steps.entries()) {
            const label = `${this.name} ${verb} ${index + 1}/${section.steps.length}`

            if (step.kind === 'deterministic') {
                const path = StepCompiler.path(Feature.prefix(this.name), verb, index, step.lang)
                const file = StepCompiler.locate(this.path, Feature.prefix(this.name), path)

                if (!(await Bun.file(file).exists())) throw new Error(`${this.name} is not compiled: ${file} is missing. Compile it where it is written: gstudio compile feature ${this.name}`)

                log(`  ${label}  script`)

                const process = Bun.spawn([StepCompiler.INTERPRETERS[StepCompiler.extension(step.lang)] ?? 'sh', file], { cwd, stdout: 'inherit', stderr: 'inherit' })
                const code = await process.exited

                if (code !== 0) throw new Error(`${label} failed (exit ${code})`)

                continue
            }

            log(`  ${label}  agent`)

            const answer = verb === 'requires' ? await agent.ask(this.prompt(verb, section, step), cwd) : await agent.act(this.prompt(verb, section, step), cwd)
            const outcome = Agent.outcome(answer)
            const said = answer.replace(Agent.OUTCOME, '').trim()

            if (said !== '') log(said.split('\n').map((line) => `    ${line}`).join('\n'))
            if (!outcome.done) throw new Error(`${label} failed${outcome.reason === '' ? '' : `: ${outcome.reason}`}`)
        }
    }

    /** What an agent is told to do one llm step of an action in a project. */
    private prompt(verb: (typeof Feature.VERBS)[number], section: StepDocument['sections'][number], step: StepDocument['sections'][number]['steps'][number]): string {
        const task =
            verb === 'requires'
                ? [
                      `You are checking whether the project in the current directory can take the "${this.name}" feature.`,
                      'Judge the step below against the project as it is: look at whatever you need, change nothing.',
                      `State what is missing when the project does not satisfy it. ${Agent.protocol('the project satisfies the step')}`,
                  ]
                : [
                      `You are performing the "${verb}" action of the "${this.name}" feature on the project in the current directory.`,
                      'The steps marked deterministic have already been run by scripts; the step below is yours, in the context of the whole action.',
                      'Read what you need, edit files, run commands. Do not ask questions: decide, act, and say in a few sentences what you did and decided.',
                      Agent.protocol('the step is complete'),
                  ]

        return [...task, '', '## Feature rules', '', this.document!.rules, '', `## The whole "${verb}" action (for context)`, '', section.source, '', '## Your step', '', step.content].join('\n')
    }

    /**
     * Compiles the feature where it is written: its own deterministic steps to scripts beside the
     * document, keyed by where they will run in a project, and every artifact it brings likewise, so
     * that installing it into a project costs no llm call that was already paid here.
     */
    async compile(agent: Agent): Promise<{ steps: { built: string[]; reused: string[]; removed: string[] } | null; artifacts: { name: string; built: string[]; reused: string[]; removed: string[] }[] }> {
        let steps = null

        if (this.document !== null && this.document.sections.length > 0) {
            const previous = await StepCompiler.manifest(this.path)
            const compiled = await new StepCompiler(agent).compile(this.document, 'feature', { dir: this.path, prefix: Feature.prefix(this.name), previous: previous.steps })

            await StepCompiler.save(this.path, { steps: compiled.steps })

            steps = { built: compiled.sections.flatMap((section) => section.built), reused: compiled.sections.flatMap((section) => section.reused), removed: compiled.removed }
        }

        const artifacts = []

        for (const artifact of await this.artifacts()) {
            const compiled = await new ArtifactCompiler({ cwd: this.path, agent }).compile(await Artifact.at(artifact.path), { dir: artifact.path, targets: [] })

            artifacts.push({ name: artifact.name, built: compiled.skills.flatMap((skill) => skill.built), reused: compiled.skills.flatMap((skill) => skill.reused), removed: compiled.removed })
        }

        return { steps, artifacts }
    }
}
