import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TemplateRef } from './TemplateRef.class.ts'
import { TemplateSource } from './TemplateSource.class.ts'

/**
 * The installed sources and what each of them provides: templates and features alike. Every source
 * is addressable by an alias, so `alias/name` always names exactly one thing of a kind; a bare name is
 * a shortcut that resolves only while it is unambiguous, or until someone says which source it meant.
 * Nothing is ever shadowed silently. Templates and features are separate namespaces: a source may
 * provide a template and a feature of the same name, and `alias/name` means the one you asked for.
 */
export class TemplateRegistry {
    /** Where gstudio keeps what is per machine: the registry and the cache. GSTUDIO_HOME moves it, for a CI job or a test. */
    static readonly HOME = process.env.GSTUDIO_HOME ?? join(homedir(), '.gstudio')
    /** Where the registry is kept. One per machine, not per project. */
    static readonly PATH = join(TemplateRegistry.HOME, 'registry.json')
    static readonly KINDS = ['template', 'feature'] as const

    private constructor(
        /** Installed sources by alias, each with the index of what it provided at its installed commit. */
        readonly sources: Record<string, { url: string; ref: string | null; sha: string | null; templates: string[]; features: string[] }>,
        /** Bare names a human has resolved to one source, per kind. Unambiguous names are absent: they resolve on their own. */
        readonly shortcuts: Record<(typeof TemplateRegistry.KINDS)[number], Record<string, string>>,
    ) {}

    /** Reads the registry, lifting one written before it knew about features into the current shape. */
    static async load(): Promise<TemplateRegistry> {
        const data = await Bun.file(TemplateRegistry.PATH).json().catch(() => null)
        const sources: TemplateRegistry['sources'] = {}
        const shortcuts = data?.shortcuts ?? {}
        const legacy = Object.values(shortcuts).some((value) => typeof value === 'string')

        for (const [alias, source] of Object.entries(data?.sources ?? {}) as [string, Partial<TemplateRegistry['sources'][string]>][])
            sources[alias] = { url: source.url!, ref: source.ref ?? null, sha: source.sha ?? null, templates: source.templates ?? [], features: source.features ?? [] }

        return new TemplateRegistry(sources, legacy ? { template: shortcuts, feature: {} } : { template: shortcuts.template ?? {}, feature: shortcuts.feature ?? {} })
    }

    async save(): Promise<void> {
        await mkdir(dirname(TemplateRegistry.PATH), { recursive: true })
        await Bun.write(TemplateRegistry.PATH, `${JSON.stringify({ sources: this.sources, shortcuts: this.shortcuts }, null, 4)}\n`)
    }

    /** The index a source keeps for a kind. */
    private static plural(kind: (typeof TemplateRegistry.KINDS)[number]): 'templates' | 'features' {
        return kind === 'template' ? 'templates' : 'features'
    }

    /**
     * Installs a source under an alias and indexes what it provides. The alias must be free, because
     * it is the root of every qualified name and so has nothing to fall back on; a name that collides
     * with another source is reported but does not stop the install, since `alias/name` still reaches it.
     */
    async install(
        url: string,
        { as = null, ref = null, refresh = false }: { as?: string | null; ref?: string | null; refresh?: boolean } = {},
    ): Promise<{ alias: string; source: TemplateSource; templates: string[]; features: string[]; conflicts: Record<(typeof TemplateRegistry.KINDS)[number], string[]> }> {
        const normalized = TemplateRef.normalize(url)
        const existing = Object.entries(this.sources).find(([, source]) => source.url === normalized)
        const alias = as ?? existing?.[0] ?? TemplateRef.defaultAlias(normalized)

        if (this.sources[alias] !== undefined && this.sources[alias]!.url !== normalized)
            throw new Error(`The alias ${alias} is already installed from ${this.sources[alias]!.url}. Install this one under another name with --as <alias>`)

        const source = await TemplateSource.fetch(normalized, ref ?? existing?.[1].ref ?? null, { refresh })
        const templates = [...(await source.templates()).keys()].sort()
        const features = [...(await source.features()).keys()].sort()

        if (existing !== undefined && existing[0] !== alias) delete this.sources[existing[0]]

        this.sources[alias] = { url: normalized, ref: source.ref, sha: source.sha, templates, features }

        await this.save()

        return {
            alias,
            source,
            templates,
            features,
            conflicts: {
                template: templates.filter((name) => this.providers('template', name).length > 1 && this.shortcuts.template[name] === undefined),
                feature: features.filter((name) => this.providers('feature', name).length > 1 && this.shortcuts.feature[name] === undefined),
            },
        }
    }

    /** Forgets a source, along with any shortcut that only made sense while it was installed. */
    async remove(alias: string): Promise<void> {
        if (this.sources[alias] === undefined) throw new Error(`No source is installed as ${alias}`)

        delete this.sources[alias]

        for (const kind of TemplateRegistry.KINDS) for (const [name, target] of Object.entries(this.shortcuts[kind])) if (target.startsWith(`${alias}/`)) delete this.shortcuts[kind][name]

        await this.save()
    }

    /** Says which source a bare name means, for names that more than one source provides. */
    async use(kind: (typeof TemplateRegistry.KINDS)[number], name: string, target: string): Promise<void> {
        const [alias, chosen] = target.split('/')

        if (alias === undefined || chosen === undefined) throw new Error(`Expected <alias>/<name>, got ${target}`)
        if (this.sources[alias] === undefined) throw new Error(`No source is installed as ${alias}`)
        if (!this.sources[alias]![TemplateRegistry.plural(kind)].includes(chosen)) throw new Error(`${alias} does not provide the ${kind} ${chosen}`)

        this.shortcuts[kind][name] = target

        await this.save()
    }

    /** Every installed source providing a thing of this kind and name. */
    providers(kind: (typeof TemplateRegistry.KINDS)[number], name: string): string[] {
        return Object.entries(this.sources).filter(([, source]) => source[TemplateRegistry.plural(kind)].includes(name)).map(([alias]) => alias).sort()
    }

    /**
     * Resolves a reference to the one source and thing it names, or refuses to guess. A bare name
     * that several sources provide and nobody has resolved is an error listing the candidates: picking
     * one would mean a commit in someone else's repository could silently change what a command does.
     */
    resolve(kind: (typeof TemplateRegistry.KINDS)[number], ref: TemplateRef): { alias: string; name: string; url: string; ref: string | null; sha: string | null } {
        const target = ref.kind === 'bare' ? this.shortcut(kind, ref.name!) : { alias: ref.alias!, name: ref.name! }
        const source = this.sources[target.alias]

        if (source === undefined) throw new Error(`No source is installed as ${target.alias}`)
        if (!source[TemplateRegistry.plural(kind)].includes(target.name))
            throw new Error(`${target.alias} does not provide the ${kind} ${target.name}. It provides: ${source[TemplateRegistry.plural(kind)].join(', ') || 'nothing'}`)

        return { alias: target.alias, name: target.name, url: source.url, ref: source.ref, sha: source.sha }
    }

    /** The source a bare name stands for, whether because it is unambiguous or because someone said so. */
    private shortcut(kind: (typeof TemplateRegistry.KINDS)[number], name: string): { alias: string; name: string } {
        const chosen = this.shortcuts[kind][name]

        if (chosen !== undefined) {
            const [alias, target] = chosen.split('/')

            if (alias === undefined || target === undefined || this.sources[alias] === undefined || !this.sources[alias]![TemplateRegistry.plural(kind)].includes(target))
                throw new Error(`The name ${name} points at ${chosen}, which is no longer installed. Point it somewhere else with: gstudio use ${kind} ${name} <alias>/<name>`)

            return { alias, name: target }
        }

        const providers = this.providers(kind, name)

        if (providers.length === 0) throw new Error(`No installed source provides the ${kind} ${name}`)
        if (providers.length > 1)
            throw new Error(`${providers.length} installed sources provide the ${kind} ${name}: ${providers.map((alias) => `${alias}/${name}`).join(', ')}\nUse one of those names, or choose which one ${name} means: gstudio use ${kind} ${name} ${providers[0]}/${name}`)

        return { alias: providers[0]!, name }
    }

    /**
     * Re-reads a source at its ref and reports what changed, per kind. A name that newly collides with
     * another source is reported before the index is updated, so upstream can never quietly take a name over.
     */
    async update(
        alias: string,
        { ref = null, refresh = true }: { ref?: string | null; refresh?: boolean } = {},
    ): Promise<{ sha: string | null } & Record<(typeof TemplateRegistry.KINDS)[number], { added: string[]; removed: string[]; conflicts: string[]; dangling: string[] }>> {
        const source = this.sources[alias]

        if (source === undefined) throw new Error(`No source is installed as ${alias}`)

        const fetched = await TemplateSource.fetch(source.url, ref ?? source.ref, { refresh })
        const fresh = { templates: [...(await fetched.templates()).keys()].sort(), features: [...(await fetched.features()).keys()].sort() }
        const report = {} as Record<(typeof TemplateRegistry.KINDS)[number], { added: string[]; removed: string[]; conflicts: string[]; dangling: string[] }>

        for (const kind of TemplateRegistry.KINDS) {
            const before = source[TemplateRegistry.plural(kind)]
            const after = fresh[TemplateRegistry.plural(kind)]
            const added = after.filter((name) => !before.includes(name))
            const removed = before.filter((name) => !after.includes(name))

            report[kind] = {
                added,
                removed,
                conflicts: added.filter((name) => this.providers(kind, name).length > 0 && this.shortcuts[kind][name] === undefined),
                dangling: removed.filter((name) => this.shortcuts[kind][name] === `${alias}/${name}`),
            }
        }

        this.sources[alias] = { url: source.url, ref: fetched.ref, sha: fetched.sha, ...fresh }

        for (const kind of TemplateRegistry.KINDS) for (const name of report[kind].dangling) delete this.shortcuts[kind][name]

        await this.save()

        return { sha: fetched.sha, ...report }
    }
}
