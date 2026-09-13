import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { StringUtils } from './StringUtils.class'

export class Artifact {
    /** Where artifact definitions live. Definitions are always files; instances are anything addressable. */
    static readonly ROOT = '.gstudio/artifacts'
    /** One document per artifact: the law, then the moves. */
    static readonly DEFINITION = 'artifact.md'
    /** The closed vocabulary: every artifact is expressed in these verbs, whatever its medium. */
    static readonly ACTIONS = ['create', 'list', 'update', 'delete', 'evaluate'] as const
    /** The scaffold a fresh definition is written with, ready for an llm to rewrite it from a description. */
    static readonly TEMPLATE = StringUtils.dedent(`
        ID: {id}

        1. ALL {Name}s are defined at {location}, where {id} is {what identifies one}
        2. {what every instance must look like}
        3. Every script receives {id} as its single first argument

        ## create

        <llm>Input: {id} and optionally the content of the {name}</llm>
        <deterministic>
            Scaffolds the {name} as defined at the rules, exits 1 if it already exists.
        </deterministic>

        ## list

        <llm>Input (Optional): search term</llm>
        <deterministic>
            Lists all the {name}s defined in the codebase that contain the search term if provided, as located by the rules.

            The result is printed in the following format:

            [{id}]: [file path]
        </deterministic>
        <llm>
            Report the results of the previous command.
        </llm>

        ## update

        <llm>Input: <{id}> <change-request></llm>
        <deterministic>
            Exits 1 and prints error message if the {name} does not exist.
        </deterministic>

        ## delete

        <llm>Input: {id}</llm>
        <deterministic>
            Removes the {name} as defined at the rules, exits 1 if it does not exist.
        </deterministic>
        <deterministic>
            Find all the existing references to the {name} in the codebase and print them to stdout in the following format:

            [file path]:[line number]
        </deterministic>
        <llm>
            Remove all the dangling references to the {name}, run the previous command to ensure all the references are gone. If not, fix it and run the command again.
        </llm>

        ## evaluate

        <llm>Input: {id}</llm>
        <deterministic>
            Evaluate that:

            1. {a rule a script can settle}

            If it complies with all the rules, exits 0.
            Otherwise, iterate over each discrepancy, print them to stdout and exit with 1.
        </deterministic>
        <llm>
            {a rule that needs judgement}
        </llm>
    `)

    private static readonly SECTION = /^##[ \t]+(\S+)[ \t]*$/gm
    private static readonly STEP = /<(deterministic|llm)(?:\s+lang="([^"]*)")?\s*>([\s\S]*?)<\/\1>/g

    private constructor(
        readonly name: string,
        readonly rules: string,
        readonly actions: {
            name: string
            source: string
            steps: { kind: 'deterministic' | 'llm'; lang?: string; content: string; hash: string }[]
        }[],
    ) {}

    static path(name: string, cwd = process.cwd()): string {
        return `${cwd}/${Artifact.ROOT}/${name}/${Artifact.DEFINITION}`
    }

    /** Scaffolds a fresh definition at its folder, exiting with an error if it already exists. */
    static async scaffold(name: string, cwd = process.cwd()): Promise<string> {
        const path = Artifact.path(name, cwd)

        if (await Bun.file(path).exists()) throw new Error(`Artifact "${name}" already exists at ${path}`)

        await mkdir(dirname(path), { recursive: true })
        await Bun.write(path, `${Artifact.TEMPLATE.replaceAll('{name}', name)}\n`)

        return path
    }

    /** Loads the artifact definition document. */
    static async load(name: string, cwd = process.cwd()): Promise<Artifact> {
        const path = Artifact.path(name, cwd)
        const file = Bun.file(path)

        if (!(await file.exists())) throw new Error(`Artifact "${name}" not found at ${path}`)

        return Artifact.parse(name, await file.text())
    }

    /** Splits a definition into its rules (the preamble) and its actions (one `## action` section each). */
    static parse(name: string, source: string): Artifact {
        const headings = [...source.matchAll(new RegExp(Artifact.SECTION.source, 'gm'))]
        const rules = source.slice(0, headings[0]?.index ?? source.length).trim()

        if (rules === '') throw new Error(`Artifact "${name}" declares no rules`)

        const actions: Artifact['actions'] = []

        for (const [index, heading] of headings.entries()) {
            const action = heading[1] as (typeof Artifact.ACTIONS)[number]
            const body = source.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? source.length)

            if (!Artifact.ACTIONS.includes(action)) throw new Error(`Artifact "${name}": unknown action "${action}"`)
            if (actions.some((other) => other.name === action)) throw new Error(`Artifact "${name}": duplicated action "${action}"`)
            if (body.trim() === '') continue

            try {
                actions.push({ name: action, source: body.trim(), steps: Artifact.steps(body, `${name}\0${rules}\0${action}`) })
            } catch (error) {
                throw new Error(`Artifact "${name}", action "${action}": ${(error as Error).message}`)
            }
        }

        return new Artifact(name, rules, actions)
    }

    action(name: (typeof Artifact.ACTIONS)[number]) {
        return this.actions.find((action) => action.name === name)
    }

    /**
     * Splits an action into its ordered steps: what can be decided, and what must be judged.
     *
     * Every step carries the hash of everything a compiler is given to build it — the artifact name,
     * its rules, the action, the language and the step itself — so a compiler can tell what changed.
     */
    private static steps(source: string, seed: string): Artifact['actions'][number]['steps'] {
        const re = new RegExp(Artifact.STEP.source, 'g')
        const steps: Artifact['actions'][number]['steps'] = []
        let last = 0
        let match: RegExpExecArray | null

        while ((match = re.exec(source))) {
            if (source.slice(last, match.index).trim() !== '') throw new Error('content outside <deterministic> and <llm> tags is not allowed')

            const [, kind, lang, content] = match
            const step =
                kind === 'deterministic'
                    ? { kind: 'deterministic' as const, lang: lang || 'sh', content: StringUtils.dedent(content ?? '') }
                    : { kind: 'llm' as const, content: StringUtils.dedent(content ?? '') }

            steps.push({
                ...step,
                hash: new Bun.CryptoHasher('sha256')
                    .update(`${seed}\0${step.kind}\0${'lang' in step ? step.lang : ''}\0${step.content}`)
                    .digest('hex'),
            })

            last = re.lastIndex
        }

        if (source.slice(last).trim() !== '') throw new Error('content outside <deterministic> and <llm> tags is not allowed')
        if (steps.length === 0) throw new Error('no <deterministic> or <llm> steps found')

        return steps
    }
}
