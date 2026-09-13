import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TemplateRef } from './TemplateRef.class.ts'

/**
 * A repository holding templates, fetched with git and kept in a content cache. A source is either
 * one template — a `template.json` at its root — or a catalog — a `templates.json` saying where its
 * templates live, each of them a directory with its own `template.json`.
 */
export class TemplateSource {
    /** Where fetched repositories are kept, keyed by repository and commit so a hit needs no network. */
    static readonly CACHE = join(homedir(), '.gstudio', 'cache')
    /** The manifest that makes a directory a template. */
    static readonly MANIFEST = 'template.json'
    /** The manifest that makes a repository a catalog of templates. */
    static readonly CATALOG = 'templates.json'
    /** Where a catalog's templates live when it does not say otherwise. */
    static readonly DEFAULT_TEMPLATES = ['templates/*']

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

        if (!(await source.single()) && !(await Bun.file(join(path, TemplateSource.CATALOG)).exists()))
            throw new Error(`${path} is not a template: it has neither ${TemplateSource.MANIFEST} nor ${TemplateSource.CATALOG}`)

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

    /** Whether this source is one template rather than a catalog of them. */
    async single(): Promise<boolean> {
        return await Bun.file(join(this.path, TemplateSource.MANIFEST)).exists()
    }

    /**
     * Every template the source provides, by name. The name is always the one in `template.json`:
     * a directory is where a template sits, never what it is called.
     */
    async templates(): Promise<Map<string, string>> {
        const found = new Map<string, string>()

        for (const path of await this.directories()) {
            const manifest = await Bun.file(join(path, TemplateSource.MANIFEST)).json().catch(() => null)

            if (manifest === null) throw new Error(`${path.slice(this.path.length + 1) || '.'} has no readable ${TemplateSource.MANIFEST}`)
            if (typeof manifest.name !== 'string' || manifest.name === '') throw new Error(`${path.slice(this.path.length + 1) || '.'}/${TemplateSource.MANIFEST} must name the template`)

            const existing = found.get(manifest.name)

            if (existing !== undefined) throw new Error(`${this.url} defines the template ${manifest.name} twice, at ${existing.slice(this.path.length + 1)} and at ${path.slice(this.path.length + 1)}`)

            found.set(manifest.name, path)
        }

        return found
    }

    /** The directories the source says hold its templates. */
    private async directories(): Promise<string[]> {
        if (await this.single()) return [this.path]

        const catalog = await Bun.file(join(this.path, TemplateSource.CATALOG)).json().catch(() => null)

        if (catalog === null) throw new Error(`${this.url} is not a template: it has neither ${TemplateSource.MANIFEST} nor ${TemplateSource.CATALOG} at its root`)

        const patterns: string[] = Array.isArray(catalog.templates) && catalog.templates.length > 0 ? catalog.templates : TemplateSource.DEFAULT_TEMPLATES
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
