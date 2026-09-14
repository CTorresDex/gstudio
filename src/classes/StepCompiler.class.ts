import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Agent } from './Agent.class.ts'
import { StepDocument } from './StepDocument.class.ts'

/**
 * Compiles the deterministic steps of a document into one script each, incrementally: building a script
 * costs an llm call, so every step is keyed by the hash of everything the compiler is given to build it.
 * A step whose hash is unchanged keeps its script and its run instruction; a step that only moved has
 * its script renamed; anything the document no longer declares is deleted.
 *
 * A document is compiled where it sits, `dir`, but keyed by where it will run, `prefix`: a feature is
 * written in one repository and installed into many projects, so its manifest names paths as the
 * project will see them, and copying the directory is all an install has to do.
 */
export class StepCompiler {
    static readonly SCRIPTS = 'scripts'
    static readonly MANIFEST = 'compiled.json'
    static readonly PLACEHOLDER = '{{script}}'
    /** The file extension a step's language compiles to. */
    static readonly EXTENSIONS: Record<string, string> = {
        sh: 'sh', bash: 'sh', zsh: 'sh', ts: 'ts', typescript: 'ts', js: 'js', javascript: 'js', py: 'py', python: 'py',
    }
    /** What runs a compiled script, by its extension, so a script needs no execute bit to be run. */
    static readonly INTERPRETERS: Record<string, string> = { sh: 'sh', ts: 'bun', js: 'bun', py: 'python3' }

    private static readonly MARKER = '---INSTRUCTION---'

    constructor(private readonly agent: Agent) {}

    /** The manifest a compiled directory keeps, or an empty one when it was never compiled. */
    static async manifest(dir: string): Promise<{ steps: Record<string, { hash: string; instruction: string }>; [key: string]: unknown }> {
        const file = Bun.file(`${dir}/${StepCompiler.MANIFEST}`)

        return (await file.exists()) ? await file.json() : { steps: {} }
    }

    static async save(dir: string, manifest: Record<string, unknown>): Promise<void> {
        await mkdir(dir, { recursive: true })
        await Bun.write(`${dir}/${StepCompiler.MANIFEST}`, `${JSON.stringify(manifest, null, 4)}\n`)
    }

    /** The extension a step compiles to. */
    static extension(lang: string | undefined): string {
        return StepCompiler.EXTENSIONS[(lang ?? StepDocument.DEFAULT_LANG).toLowerCase()] ?? 'sh'
    }

    /** Where a step's script lives, relative to the root of the project that runs it. */
    static path(prefix: string, section: string, index: number, lang: string | undefined): string {
        return `${prefix}/${StepCompiler.SCRIPTS}/${section}/step-${index + 1}.${StepCompiler.extension(lang)}`
    }

    /** Where a script keyed by `path` sits on disk, for a document sitting at `dir`. */
    static locate(dir: string, prefix: string, path: string): string {
        return `${dir}${path.slice(prefix.length)}`
    }

    /**
     * Compiles every deterministic step of a document, reusing what it can from `previous`. Returns the
     * new step manifest, what was removed, and every section as the compiler saw it: for each step,
     * either the script it compiled to with the instruction to run it, or the content the llm gets.
     */
    async compile(
        document: StepDocument,
        kind: string,
        { dir, prefix, previous }: { dir: string; prefix: string; previous: Record<string, { hash: string; instruction: string }> },
    ): Promise<{
        steps: Record<string, { hash: string; instruction: string }>
        sections: {
            name: string
            built: string[]
            reused: string[]
            steps: ({ kind: 'deterministic'; path: string; instruction: string } | { kind: 'llm'; content: string })[]
        }[]
        removed: string[]
    }> {
        const orphans = new Map<string, { path: string; instruction: string }>()
        const moved = new Set<string>()

        for (const [path, entry] of Object.entries(previous)) orphans.set(entry.hash, { path, instruction: entry.instruction })

        const steps: Record<string, { hash: string; instruction: string }> = {}
        const sections: Awaited<ReturnType<StepCompiler['compile']>>['sections'] = []

        for (const section of document.sections) {
            const compiled: (typeof sections)[number]['steps'] = []
            const built: string[] = []
            const reused: string[] = []

            for (const [index, step] of section.steps.entries()) {
                if (step.kind === 'llm') {
                    compiled.push({ kind: 'llm', content: step.content })
                    continue
                }

                const path = StepCompiler.path(prefix, section.name, index, step.lang)
                const file = StepCompiler.locate(dir, prefix, path)
                const kept = await this.reuse(step.hash, path, previous[path], { dir, prefix }, orphans, moved)

                if (kept === null) {
                    const generated = await this.generate(document, kind, section, step, path)

                    await mkdir(dirname(file), { recursive: true })
                    await Bun.write(file, generated.content)
                    await chmod(file, 0o755)

                    steps[path] = { hash: step.hash, instruction: generated.instruction }
                    built.push(path)
                } else {
                    steps[path] = { hash: step.hash, instruction: kept }
                    reused.push(path)
                }

                compiled.push({ kind: 'deterministic', path, instruction: steps[path]!.instruction.replaceAll(StepCompiler.PLACEHOLDER, path) })
            }

            sections.push({ name: section.name, built, reused, steps: compiled })
        }

        return { steps, sections, removed: await this.prune(document, { dir, prefix }, previous, steps, moved) }
    }

    /** Returns the run instruction of a script that survives this compile, or null when it must be built. */
    private async reuse(
        hash: string,
        path: string,
        previous: { hash: string; instruction: string } | undefined,
        where: { dir: string; prefix: string },
        orphans: Map<string, { path: string; instruction: string }>,
        moved: Set<string>,
    ): Promise<string | null> {
        if (previous?.hash === hash && (await Bun.file(StepCompiler.locate(where.dir, where.prefix, path)).exists())) {
            orphans.delete(hash)

            return previous.instruction
        }

        const relocated = orphans.get(hash)

        if (relocated === undefined || relocated.path === path || !(await Bun.file(StepCompiler.locate(where.dir, where.prefix, relocated.path)).exists())) return null

        const file = StepCompiler.locate(where.dir, where.prefix, path)

        await mkdir(dirname(file), { recursive: true })
        await rename(StepCompiler.locate(where.dir, where.prefix, relocated.path), file)
        orphans.delete(hash)
        moved.add(relocated.path)

        return relocated.instruction
    }

    /** Deletes every script the document no longer declares, and the directory of every section it dropped. */
    private async prune(
        document: StepDocument,
        where: { dir: string; prefix: string },
        previous: Record<string, unknown>,
        steps: Record<string, unknown>,
        moved: Set<string>,
    ): Promise<string[]> {
        const removed = []
        const dropped = new Set<string>()

        for (const path of Object.keys(previous)) {
            const section = path.slice(`${where.prefix}/${StepCompiler.SCRIPTS}/`.length).split('/')[0]!

            if (document.section(section) === undefined) dropped.add(section)
            if (path in steps || moved.has(path)) continue

            await rm(StepCompiler.locate(where.dir, where.prefix, path), { force: true })
            removed.push(path)
        }

        for (const section of dropped) {
            const path = `${where.prefix}/${StepCompiler.SCRIPTS}/${section}`

            await rm(StepCompiler.locate(where.dir, where.prefix, path), { recursive: true, force: true })
            removed.push(path)
        }

        return removed
    }

    private async generate(
        document: StepDocument,
        kind: string,
        section: StepDocument['sections'][number],
        step: StepDocument['sections'][number]['steps'][number],
        path: string,
    ): Promise<{ content: string; instruction: string }> {
        const lang = step.lang ?? StepDocument.DEFAULT_LANG
        const feature = kind === 'feature'
        const text = [
            `You are compiling the "${section.name}" action of the "${document.name}" ${kind} into a script.`,
            `Write a single self-contained ${lang} script that implements ONLY the deterministic step below.`,
            feature
                ? 'The script is executed from the root of the project the feature is being installed into, so every path in it is relative to that root.'
                : 'The script is executed from the project root, so every path in it is relative to the project root.',
            feature ? `It will be stored at ${path}. It receives no arguments.` : `It will be stored at ${path}. It receives its input as command line arguments.`,
            `Whenever the step says "as defined at the rules", resolve it with the ${kind} rules below.`,
            'Do not implement anything that the step leaves to the llm. Do not add features the step does not ask for.',
            'Exit with a non-zero code on any failure the step describes, printing a clear message.',
            '',
            'Then state how the script must be invoked.',
            `Output the raw script contents first, then a line containing exactly ${StepCompiler.MARKER},`,
            `then one sentence telling the reader to run the script, referring to its path as ${StepCompiler.PLACEHOLDER}.`,
            `If the script takes arguments, the instruction must spell their syntax out explicitly (e.g. \`${StepCompiler.PLACEHOLDER} <name> [--flag]\`);` +
                ` if it takes none, use \`${StepCompiler.PLACEHOLDER}\` on its own.`,
            'No markdown fences, no explanation, no preamble: the very first line of your output is the first line of the script.',
            '',
            `## ${kind[0]!.toUpperCase()}${kind.slice(1)} rules`,
            '',
            document.rules,
            '',
            `## The whole "${section.name}" action (for context only, do NOT implement the other steps)`,
            '',
            section.source,
            '',
            '## The deterministic step to implement',
            '',
            step.content,
        ].join('\n')

        const raw = await this.agent.ask(text)
        const marker = raw.indexOf(StepCompiler.MARKER)

        if (marker === -1) throw new Error(`Generated script for ${path} is missing its run instruction`)

        const shebang = raw.slice(0, marker).trim().indexOf('#!')
        const script = raw
            .slice(0, marker)
            .trim()
            .slice(shebang > 0 ? shebang : 0)
            .replace(/^```[a-z]*\n/i, '')
            .replace(/\n```$/, '')
            .trimEnd()
        const instruction = raw.slice(marker + StepCompiler.MARKER.length).trim()

        if (script === '') throw new Error(`Generated script for ${path} is empty`)
        if (!instruction.includes(StepCompiler.PLACEHOLDER)) {
            throw new Error(`Generated run instruction for ${path} must invoke the script as ${StepCompiler.PLACEHOLDER}`)
        }

        return { content: `${script}\n`, instruction }
    }
}
