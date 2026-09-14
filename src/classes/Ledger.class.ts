import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * What a project knows about the features installed in it: for each one, whether it was asked for or
 * arrived as a dependency, what it requires, where it came from, and the hash of every file and
 * artifact it wrote. The hashes are what make removal and updates honest — a file whose hash still
 * matches is the feature's to take back or replace; one that does not has been edited, and is yours.
 *
 * It shares `.gstudio/project.json` with the template pin, and leaves everything beside `features` alone.
 */
export class Ledger {
    /** Where a project keeps it: the same file that pins the template. */
    static readonly PATH = '.gstudio/project.json'

    private constructor(
        readonly root: string,
        private readonly data: {
            features: Record<
                string,
                {
                    /** Whether someone asked for it, as opposed to a feature that arrived because another required it. */
                    explicit: boolean
                    /** The installed features it requires, by name, so removing one can tell who still needs what. */
                    requires: string[]
                    version: string | null
                    url: string
                    ref: string | null
                    sha: string | null
                    linked: boolean
                    /** Every file the feature wrote, relative to the project, and the hash of what it wrote there. */
                    files: Record<string, string>
                    /** Every artifact the feature brought, and the hash of the definition it brought. */
                    artifacts: Record<string, string>
                }
            >
            [key: string]: unknown
        },
    ) {}

    static async load(root: string): Promise<Ledger> {
        const data = await Bun.file(join(root, Ledger.PATH)).json().catch(() => ({}))

        return new Ledger(root, { ...data, features: data.features ?? {} })
    }

    async save(): Promise<void> {
        await mkdir(dirname(join(this.root, Ledger.PATH)), { recursive: true })
        await Bun.write(join(this.root, Ledger.PATH), `${JSON.stringify(this.data, null, 4)}\n`)
    }

    /** Every installed feature, by name. */
    get names(): string[] {
        return Object.keys(this.data.features).sort()
    }

    entry(name: string): Ledger['data']['features'][string] | undefined {
        return this.data.features[name]
    }

    record(name: string, entry: Ledger['data']['features'][string]): void {
        this.data.features[name] = entry
    }

    forget(name: string): void {
        delete this.data.features[name]
    }

    /** The installed features that require this one. */
    dependents(name: string): string[] {
        return Object.entries(this.data.features).filter(([, entry]) => entry.requires.includes(name)).map(([other]) => other).sort()
    }

    /** The installed features that brought this artifact, so it goes only when the last of them does. */
    users(artifact: string): string[] {
        return Object.entries(this.data.features).filter(([, entry]) => artifact in entry.artifacts).map(([name]) => name).sort()
    }

    /** Features nobody asked for that nothing installed still requires. */
    orphans(): string[] {
        return this.names.filter((name) => !this.data.features[name]!.explicit && this.dependents(name).length === 0)
    }

    /** The hash of a file's content, or null when there is no file there. */
    static async digest(path: string): Promise<string | null> {
        const file = Bun.file(path)

        if (!(await file.exists())) return null

        return new Bun.CryptoHasher('sha256').update(await file.arrayBuffer()).digest('hex')
    }
}
