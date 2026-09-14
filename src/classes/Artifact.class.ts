import { mkdir } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { StepDocument } from './StepDocument.class.ts'
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

    private constructor(readonly document: StepDocument) {}

    get name(): string {
        return this.document.name
    }

    /** The law every instance of this artifact is held to. */
    get rules(): string {
        return this.document.rules
    }

    /** The moves the definition declares, in the order it declares them. */
    get actions(): StepDocument['sections'] {
        return this.document.sections
    }

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

    /** Reads the definition sitting in a directory, wherever that is: inside a feature, an artifact is named by its folder. */
    static async at(dir: string): Promise<Artifact> {
        const file = Bun.file(`${dir}/${Artifact.DEFINITION}`)

        if (!(await file.exists())) throw new Error(`No ${Artifact.DEFINITION} at ${dir}`)

        return Artifact.parse(basename(dir), await file.text())
    }

    /** Reads a definition as the rules it opens with and the actions that follow them. */
    static parse(name: string, source: string): Artifact {
        return new Artifact(StepDocument.parse('Artifact', name, source, Artifact.ACTIONS))
    }

    action(name: (typeof Artifact.ACTIONS)[number]): StepDocument['sections'][number] | undefined {
        return this.document.section(name)
    }
}
