import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TemplateRef } from './TemplateRef.class.ts'

/**
 * A repository holding templates and features, fetched with git and kept in a content cache. A source
 * is either one thing — a `template.json` or a `feature.json` at its root — or a catalog — a
 * `gstudio.json` saying where its templates and features live, each of them a directory with its own
 * manifest. Where a template or feature sits in the repository is the author's business: the catalog
 * names the directories, and everything is addressed by the name in its manifest.
 */
export class TemplateSource {
    /** Where fetched repositories are kept, keyed by repository and commit so a hit needs no network. */
    static readonly CACHE = join(process.env.GSTUDIO_HOME ?? join(homedir(), '.gstudio'), 'cache')
    /** The two kinds of thing a source provides: what makes a directory one, and where a catalog lists them. */
    static readonly KINDS = {
        template: { manifest: 'template.json', key: 'templates', defaults: ['templates/*'] },
        feature: { manifest: 'feature.json', key: 'features', defaults: ['features/*'] },
    } as const
    /** The manifest that makes a directory a template. */
    static readonly MANIFEST = TemplateSource.KINDS.template.manifest
    /** The manifest that makes a repository a catalog. */
    static readonly CATALOG = 'gstudio.json'
    /** What the catalog was called when it could only list templates. Still read, never written. */
    static readonly LEGACY_CATALOG = 'templates.json'

    private constructor(
        /** The repository, normalized: the identity two spellings of the same URL share. */
        readonly url: string,
        /** The branch or tag asked for, or null for the repository's default. */
        readonly ref: string | null,
        /** The commit the ref resolved to, or null for a linked source, which has no snapshot to pin. */
        readonly sha: string | null,
        /** The checkout in the cache, or the directory itself when the source is linked. */
        readonly path: string,
        /**
         * Whether the source is a directory on this machine, used where it sits. A linked source is
         * read fresh every time, so a template being written is installed as it is edited.
         */
        readonly linked: boolean,
    ) {}

    /** Fetches a repository at a ref and returns it, reusing the cache unless asked to refresh. */
    static async fetch(url: string, ref: string | null = null, { refresh = false } = {}): Promise<TemplateSource> {
        const normalized = TemplateRef.normalize(url)

        if (TemplateRef.isLocal(url)) return await TemplateSource.link(normalized)

        const sha = await TemplateSource.resolve(normalized, ref)
        const path = join(TemplateSource.CACHE, normalized, sha)

        if (refresh) await rm(path, { recursive: true, force: true })

        if (!(await TemplateSource.exists(path))) await TemplateSource.clone(normalized, ref, path)

        return new TemplateSource(normalized, ref, sha, path, false)
    }

    /**
     * Takes a directory on this machine as a source, as it sits. Nothing is copied and nothing is
     * pinned: git is how a template travels, not how it is written, and a folder being edited has no
     * commit worth recording.
     */
    private static async link(path: string): Promise<TemplateSource> {
        if (!(await TemplateSource.exists(path))) throw new Error(`No such directory: ${path}`)

        const source = new TemplateSource(path, null, null, path, true)

        if (!(await source.single('template')) && !(await source.single('feature')) && (await source.catalog()) === null)
            throw new Error(`${path} is not a source: it has no ${TemplateSource.MANIFEST}, ${TemplateSource.KINDS.feature.manifest} or ${TemplateSource.CATALOG}`)

        return source
    }

    /** Asks the remote which commit a ref points at, without fetching anything else. */
    private static async resolve(url: string, ref: string | null): Promise<string> {
        const remote = TemplateRef.clonable(url)
        const args = ref === null ? ['ls-remote', remote, 'HEAD'] : ['ls-remote', remote, ref]
        const result = await TemplateSource.git(args)
        const sha = result.split(/\s/)[0]

        if (result === '' || !sha) throw new Error(`Could not resolve ${ref ?? 'HEAD'} at ${remote}`)

        return sha
    }

    /** Takes a shallow copy of the repository at a ref, without its history. */
    private static async clone(url: string, ref: string | null, path: string): Promise<void> {
        const remote = TemplateRef.clonable(url)
        const branch = ref === null ? [] : ['--branch', ref]

        await mkdir(join(path, '..'), { recursive: true })
        await TemplateSource.git(['clone', '--depth', '1', ...branch, remote, path])
        await rm(join(path, '.git'), { recursive: true, force: true })
    }

    /** Runs git, failing with what git said rather than with an exit code. */
    private static async git(args: string[]): Promise<string> {
        const process = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
        const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])

        if (code !== 0) throw new Error(`git ${args[0]} failed: ${stderr.trim() || `exit ${code}`}`)

        return stdout.trim()
    }

    private static async exists(path: string): Promise<boolean> {
        return await stat(path).then(() => true).catch(() => false)
    }

    /** How a source's version reads: a short commit, or that there is none because it is linked. */
    static commit(sha: string | null): string {
        return sha === null ? 'linked' : sha.slice(0, 7)
    }

    /** How a source reads when named in full: where it came from and which version of it. */
    static origin(url: string, sha: string | null): string {
        return sha === null ? `${url} (linked)` : `${url} at ${sha.slice(0, 7)}`
    }

    /** Whether this source is one template, or one feature, rather than a catalog of them. */
    async single(kind: keyof typeof TemplateSource.KINDS): Promise<boolean> {
        return await Bun.file(join(this.path, TemplateSource.KINDS[kind].manifest)).exists()
    }

    /** Every template the source provides, by name. */
    async templates(): Promise<Map<string, string>> {
        return await this.index('template')
    }

    /** Every feature the source provides, by name. */
    async features(): Promise<Map<string, string>> {
        return await this.index('feature')
    }

    /**
     * Everything of one kind the source provides, by name. The name is always the one in the manifest:
     * a directory is where a thing sits, never what it is called.
     */
    private async index(kind: keyof typeof TemplateSource.KINDS): Promise<Map<string, string>> {
        const { manifest } = TemplateSource.KINDS[kind]
        const found = new Map<string, string>()

        for (const path of await this.directories(kind)) {
            const data = await Bun.file(join(path, manifest)).json().catch(() => null)
            const where = path.slice(this.path.length + 1) || '.'

            if (data === null) throw new Error(`${where} has no readable ${manifest}`)
            if (typeof data.name !== 'string' || data.name === '') throw new Error(`${where}/${manifest} must name the ${kind}`)

            const existing = found.get(data.name)

            if (existing !== undefined) throw new Error(`${this.url} defines the ${kind} ${data.name} twice, at ${existing.slice(this.path.length + 1)} and at ${where}`)

            found.set(data.name, path)
        }

        return found
    }

    /** The catalog, whichever name it goes by, or null when the source has none. */
    private async catalog(): Promise<Record<string, unknown> | null> {
        for (const name of [TemplateSource.CATALOG, TemplateSource.LEGACY_CATALOG]) {
            const data = await Bun.file(join(this.path, name)).json().catch(() => null)

            if (data !== null) return data
        }

        return null
    }

    /** The directories the source says hold its things of one kind. */
    private async directories(kind: keyof typeof TemplateSource.KINDS): Promise<string[]> {
        if (await this.single(kind)) return [this.path]

        const catalog = await this.catalog()

        if (catalog === null) {
            const other = kind === 'template' ? 'feature' : 'template'

            if (await this.single(other)) return []

            throw new Error(`${this.url} is not a source: it has no ${TemplateSource.MANIFEST}, ${TemplateSource.KINDS.feature.manifest} or ${TemplateSource.CATALOG} at its root`)
        }

        const listed = catalog[TemplateSource.KINDS[kind].key]
        const patterns: readonly string[] = Array.isArray(listed) && listed.length > 0 ? listed : TemplateSource.KINDS[kind].defaults
        const directories: string[] = []

        for (const pattern of patterns) directories.push(...(await this.expand(pattern)))

        return directories
    }

    /** Turns one path or one `*`-terminated path from a catalog into the directories it names. */
    private async expand(pattern: string): Promise<string[]> {
        const clean = pattern.replace(/^\.?\//, '').replace(/\/+$/, '')

        if (!clean.endsWith('*')) return [join(this.path, clean)]

        const parent = join(this.path, clean.slice(0, -1))
        const entries = await readdir(parent, { withFileTypes: true }).catch(() => [])

        return entries.filter((entry) => entry.isDirectory()).map((entry) => join(parent, entry.name)).sort()
    }
}
