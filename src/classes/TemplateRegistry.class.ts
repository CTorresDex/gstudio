import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TemplateRef } from './TemplateRef.class.ts'
import { TemplateSource } from './TemplateSource.class.ts'

/**
 * The installed sources and what each of them provides. Every source is addressable by an alias, so
 * `alias/name` always names exactly one template; a bare name is a shortcut that resolves only while
 * it is unambiguous, or until someone says which source it meant. Nothing is ever shadowed silently.
 */
export class TemplateRegistry {
    /** Where the registry is kept. One per machine, not per project. */
    static readonly PATH = join(homedir(), '.gstudio', 'registry.json')

    private constructor(
        /** Installed sources by alias, each with the index of templates it provided at its installed commit. */
        readonly sources: Record<string, { url: string; ref: string | null; sha: string | null; templates: string[] }>,
        /** Bare names a human has resolved to one source. Unambiguous names are absent: they resolve on their own. */
        readonly shortcuts: Record<string, string>,
    ) {}

    static async load(): Promise<TemplateRegistry> {
        const data = await Bun.file(TemplateRegistry.PATH).json().catch(() => null)

        return new TemplateRegistry(data?.sources ?? {}, data?.shortcuts ?? {})
    }

    async save(): Promise<void> {
        await mkdir(dirname(TemplateRegistry.PATH), { recursive: true })
        await Bun.write(TemplateRegistry.PATH, `${JSON.stringify({ sources: this.sources, shortcuts: this.shortcuts }, null, 4)}\n`)
    }

    /**
     * Installs a source under an alias and indexes what it provides. The alias must be free, because
     * it is the root of every qualified name and so has nothing to fall back on; a template name that
     * collides with another source is reported but does not stop the install, since `alias/name`
     * still reaches it.
     */
    async install(url: string, { as = null, ref = null, refresh = false }: { as?: string | null; ref?: string | null; refresh?: boolean } = {}): Promise<{ alias: string; source: TemplateSource; templates: string[]; conflicts: string[] }> {
        const normalized = TemplateRef.normalize(url)
        const existing = Object.entries(this.sources).find(([, source]) => source.url === normalized)
        const alias = as ?? existing?.[0] ?? TemplateRef.defaultAlias(normalized)

        if (this.sources[alias] !== undefined && this.sources[alias]!.url !== normalized)
            throw new Error(`The alias ${alias} is already installed from ${this.sources[alias]!.url}. Install this one under another name with --as <alias>`)

        const source = await TemplateSource.fetch(normalized, ref ?? existing?.[1].ref ?? null, { refresh })
        const templates = [...(await source.templates()).keys()].sort()

        if (existing !== undefined && existing[0] !== alias) delete this.sources[existing[0]]

        this.sources[alias] = { url: normalized, ref: source.ref, sha: source.sha, templates }

        await this.save()

        return { alias, source, templates, conflicts: templates.filter((name) => this.providers(name).length > 1 && this.shortcuts[name] === undefined) }
    }

    /** Forgets a source, along with any shortcut that only made sense while it was installed. */
    async remove(alias: string): Promise<void> {
        if (this.sources[alias] === undefined) throw new Error(`No source is installed as ${alias}`)

        delete this.sources[alias]

        for (const [name, target] of Object.entries(this.shortcuts)) if (target.startsWith(`${alias}/`)) delete this.shortcuts[name]

        await this.save()
    }

    /** Says which source a bare name means, for names that more than one source provides. */
    async use(name: string, target: string): Promise<void> {
        const [alias, template] = target.split('/')

        if (alias === undefined || template === undefined) throw new Error(`Expected <alias>/<name>, got ${target}`)
        if (this.sources[alias] === undefined) throw new Error(`No source is installed as ${alias}`)
        if (!this.sources[alias]!.templates.includes(template)) throw new Error(`${alias} does not provide the template ${template}`)

        this.shortcuts[name] = target

        await this.save()
    }

    /** Every installed source providing a template of this name. */
    providers(name: string): string[] {
        return Object.entries(this.sources).filter(([, source]) => source.templates.includes(name)).map(([alias]) => alias).sort()
    }

    /**
     * Resolves a reference to the one source and template it names, or refuses to guess. A bare name
     * that several sources provide and nobody has resolved is an error listing the candidates: picking
     * one would mean a commit in someone else's repository could silently change what `init` does.
     */
    resolve(ref: TemplateRef): { alias: string; name: string; url: string; ref: string | null; sha: string | null } {
        const target = ref.kind === 'bare' ? this.shortcut(ref.name!) : { alias: ref.alias!, name: ref.name! }
        const source = this.sources[target.alias]

        if (source === undefined) throw new Error(`No source is installed as ${target.alias}`)
        if (!source.templates.includes(target.name)) throw new Error(`${target.alias} does not provide the template ${target.name}. It provides: ${source.templates.join(', ') || 'nothing'}`)

        return { alias: target.alias, name: target.name, url: source.url, ref: source.ref, sha: source.sha }
    }

    /** The source a bare name stands for, whether because it is unambiguous or because someone said so. */
    private shortcut(name: string): { alias: string; name: string } {
        const chosen = this.shortcuts[name]

        if (chosen !== undefined) {
            const [alias, template] = chosen.split('/')

            if (alias === undefined || template === undefined || this.sources[alias] === undefined || !this.sources[alias]!.templates.includes(template))
                throw new Error(`The name ${name} points at ${chosen}, which is no longer installed. Point it somewhere else with: gstudio use template ${name} <alias>/<name>`)

            return { alias, name: template }
        }

        const providers = this.providers(name)

        if (providers.length === 0) throw new Error(`No installed source provides the template ${name}`)
        if (providers.length > 1)
            throw new Error(`${providers.length} installed sources provide the template ${name}: ${providers.map((alias) => `${alias}/${name}`).join(', ')}\nUse one of those names, or choose which one ${name} means: gstudio use template ${name} ${providers[0]}/${name}`)

        return { alias: providers[0]!, name }
    }

    /**
     * Re-reads a source at its ref and reports what changed. A name that newly collides with another
     * source is reported before the index is updated, so upstream can never quietly take a name over.
     */
    async update(alias: string, { ref = null, refresh = true }: { ref?: string | null; refresh?: boolean } = {}): Promise<{ sha: string | null; added: string[]; removed: string[]; conflicts: string[]; dangling: string[] }> {
        const source = this.sources[alias]

        if (source === undefined) throw new Error(`No source is installed as ${alias}`)

        const fetched = await TemplateSource.fetch(source.url, ref ?? source.ref, { refresh })
        const templates = [...(await fetched.templates()).keys()].sort()
        const added = templates.filter((name) => !source.templates.includes(name))
        const removed = source.templates.filter((name) => !templates.includes(name))
        const conflicts = added.filter((name) => this.providers(name).length > 0 && this.shortcuts[name] === undefined)
        const dangling = removed.filter((name) => this.shortcuts[name] === `${alias}/${name}`)

        this.sources[alias] = { url: source.url, ref: fetched.ref, sha: fetched.sha, templates }

        for (const name of dangling) delete this.shortcuts[name]

        await this.save()

        return { sha: fetched.sha, added, removed, conflicts, dangling }
    }
}
