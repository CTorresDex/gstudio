import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The command line. Commands are files, not registrations: every `src/commands/**\/*.command.ts`
 * is a command whose name is its path — `compile artifact` is `src/commands/compile/artifact.command.ts` —
 * and whose default export is what runs. Nothing has to be declared anywhere for a new file to be callable.
 */
export class CLI {
    /** Where commands live. Resolved from this file so the CLI works from any working directory. */
    static readonly ROOT = join(import.meta.dir, '..', 'commands')
    /** What makes a file a command. */
    static readonly SUFFIX = '.command.ts'

    /** Parses argv, resolves the command it names and runs it. */
    static async run(argv: string[] = process.argv.slice(2)): Promise<void> {
        const { positional, flags } = CLI.parse(argv)

        if (positional.length === 0) throw new Error(await CLI.usage())

        const resolved = await CLI.resolve(positional)

        if (resolved === null) throw new Error(`Unknown command: ${positional.join(' ')}\n\n${await CLI.usage()}`)

        await resolved.handler(resolved.args, { flags })
    }

    /** Splits argv into the words that name a command and the flags that configure it. */
    private static parse(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
        const positional: string[] = []
        const flags: Record<string, string | boolean> = {}

        for (let index = 0; index < argv.length; index++) {
            const token = argv[index]!

            if (!token.startsWith('-') || token === '-' || token === '--') {
                positional.push(token)
                continue
            }

            const body = token.slice(token.startsWith('--') ? 2 : 1)
            const equals = body.indexOf('=')

            if (equals !== -1) {
                flags[body.slice(0, equals)] = body.slice(equals + 1)
                continue
            }

            const next = argv[index + 1]

            if (next !== undefined && !next.startsWith('-')) {
                flags[body] = next
                index++
            } else {
                flags[body] = true
            }
        }

        return { positional, flags }
    }

    /** Walks the words of a command until one of them names a file, and hands the rest to it as arguments. */
    private static async resolve(segments: string[]): Promise<{
        handler: (args: string[], context: { flags: Record<string, string | boolean> }) => unknown
        args: string[]
    } | null> {
        let dir = CLI.ROOT

        for (const [index, segment] of segments.entries()) {
            const path = join(dir, `${segment}${CLI.SUFFIX}`)

            if (await Bun.file(path).exists()) {
                const handler = (await import(path)).default

                if (typeof handler !== 'function') throw new Error(`Command ${path} must have a default export function`)

                return { handler, args: segments.slice(index + 1) }
            }

            dir = join(dir, segment)
        }

        return null
    }

    /** Every command there is, named the way it must be typed. */
    private static async commands(dir: string = CLI.ROOT, prefix: string[] = []): Promise<string[]> {
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
        const commands: string[] = []

        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.isDirectory()) commands.push(...(await CLI.commands(join(dir, entry.name), [...prefix, entry.name])))
            else if (entry.name.endsWith(CLI.SUFFIX)) commands.push([...prefix, entry.name.slice(0, -CLI.SUFFIX.length)].join(' '))
        }

        return commands
    }

    private static async usage(): Promise<string> {
        const commands = await CLI.commands()

        return ['Usage: gstudio <command> [...args] [--flags]', '', 'Commands:', ...commands.map((command) => `  ${command}`)].join('\n')
    }
}
