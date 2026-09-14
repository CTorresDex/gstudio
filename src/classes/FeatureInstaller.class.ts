import { cp, mkdir, readdir, rm, rmdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { Agent } from './Agent.class.ts'
import { Artifact } from './Artifact.class.ts'
import { ArtifactCompiler } from './ArtifactCompiler.class.ts'
import { Feature } from './Feature.class.ts'
import { Ledger } from './Ledger.class.ts'
import { TemplateRef } from './TemplateRef.class.ts'
import { TemplateRegistry } from './TemplateRegistry.class.ts'
import { TemplateSource } from './TemplateSource.class.ts'

/**
 * Puts features into a project and takes them out. Adding one is a transaction with a strict order:
 * resolve the graph of what it requires, run every precondition, check every file and artifact for a
 * collision — and only then write, because nothing is harder to explain than a project half installed.
 * Removing one gives back exactly what the ledger says was written, wherever it is still untouched,
 * and then sweeps away whatever arrived as a dependency and nothing needs any more.
 */
export class FeatureInstaller {
    constructor(
        private readonly root: string,
        private readonly agent: Agent,
        private readonly log: (line: string) => void = () => {},
    ) {}

    /**
     * Adds a feature and everything it requires. A feature already installed as someone's dependency
     * becomes explicit instead, so it survives that someone's removal.
     */
    async add(text: string, { refresh = false } = {}): Promise<{ installed: string[]; promoted: string | null }> {
        const registry = await TemplateRegistry.load()
        const ledger = await Ledger.load(this.root)
        const reference = TemplateRef.parse(text)
        const known = reference.kind === 'url' ? undefined : ledger.entry(reference.name!)

        if (known !== undefined) {
            if (known.explicit) return { installed: [], promoted: null }

            ledger.record(reference.name!, { ...known, explicit: true })
            await ledger.save()

            return { installed: [], promoted: reference.name! }
        }

        const root = await this.locate(text, null, registry, refresh)
        const plan = await this.plan([root], ledger, registry, refresh)

        for (const node of plan) await node.feature.run('requires', { cwd: this.root, agent: this.agent, log: this.log })

        await this.check(plan)

        const installed = []

        for (const node of plan) {
            await this.write(node, ledger, node.feature.name === root.feature.name)
            installed.push(node.feature.name)
        }

        return { installed, promoted: null }
    }

    /** Removes a feature nothing else requires, then every dependency left without a reason to stay. */
    async remove(name: string): Promise<{ removed: string[]; kept: string[] }> {
        const ledger = await Ledger.load(this.root)

        if (ledger.entry(name) === undefined) throw new Error(`${name} is not installed in this project`)

        const dependents = ledger.dependents(name)

        if (dependents.length > 0) throw new Error(`${name} is required by ${dependents.join(' and ')}. Remove ${dependents.length === 1 ? 'it' : 'them'} first`)

        const removed: string[] = []
        const kept: string[] = []

        await this.erase(name, ledger, kept)
        removed.push(name)

        for (let orphan = ledger.orphans()[0]; orphan !== undefined; orphan = ledger.orphans()[0]) {
            await this.erase(orphan, ledger, kept)
            removed.push(orphan)
        }

        return { removed, kept }
    }

    /**
     * Brings an installed feature to what its source now says. Every file it wrote is compared with
     * what the ledger recorded: an untouched one is replaced, an edited one is reconciled by an agent
     * that keeps the edits, a deleted one stays deleted. New dependencies are installed first.
     */
    async update(name: string, { refresh = true } = {}): Promise<{ sha: string | null; current: boolean; installed: string[]; updated: string[]; reconciled: string[]; conflicts: { path: string; upstream: string; reason: string }[]; kept: string[] }> {
        const ledger = await Ledger.load(this.root)
        const entry = ledger.entry(name)

        if (entry === undefined) throw new Error(`${name} is not installed in this project`)

        const source = await TemplateSource.fetch(entry.url, entry.ref, { refresh })

        if (!source.linked && source.sha === entry.sha) return { sha: source.sha, current: true, installed: [], updated: [], reconciled: [], conflicts: [], kept: [] }

        const fresh = await Feature.read(source, name)
        const registry = await TemplateRegistry.load()
        const plan = await this.plan([{ feature: fresh, source }], ledger, registry, refresh)
        const self = plan.find((node) => node.feature.name === name)!
        const dependencies = plan.filter((node) => node.feature.name !== name)
        const base = source.linked || entry.sha === null ? null : join(TemplateSource.CACHE, entry.url, entry.sha, relative(source.path, fresh.path))

        for (const node of plan) await node.feature.run('requires', { cwd: this.root, agent: this.agent, log: this.log })

        await this.check(dependencies)

        const overlay = await fresh.overlay()
        const artifacts = await fresh.artifacts()
        const problems: string[] = []
        const changes: {
            kind: 'add' | 'replace' | 'reconcile' | 'same' | 'gone'
            relative: string
            absolute: string | null
            upstream: string
            artifact: string | null
        }[] = []

        for (const file of overlay) {
            const recorded = entry.files[file.relative]
            const upstream = (await Ledger.digest(file.absolute))!
            const current = await Ledger.digest(join(this.root, file.relative))

            if (recorded === undefined) {
                if (current !== null) problems.push(`${file.relative} already exists`)
                else changes.push({ kind: 'add', relative: file.relative, absolute: file.absolute, upstream, artifact: null })
            } else if (current === null || upstream === recorded) changes.push({ kind: 'same', relative: file.relative, absolute: file.absolute, upstream, artifact: null })
            else changes.push({ kind: current === recorded ? 'replace' : 'reconcile', relative: file.relative, absolute: file.absolute, upstream, artifact: null })
        }

        for (const [path, recorded] of Object.entries(entry.files))
            if (!overlay.some((file) => file.relative === path)) changes.push({ kind: 'gone', relative: path, absolute: null, upstream: recorded, artifact: null })

        for (const artifact of artifacts) {
            const definition = join(artifact.path, Artifact.DEFINITION)
            const path = `${ArtifactCompiler.prefix(artifact.name)}/${Artifact.DEFINITION}`
            const recorded = entry.artifacts[artifact.name]
            const upstream = (await Ledger.digest(definition))!
            const current = await Ledger.digest(join(this.root, path))

            if (recorded === undefined) {
                if (current !== null && current !== upstream) problems.push(`the artifact ${artifact.name} already exists at ${Artifact.ROOT}/${artifact.name} and differs from ${name}'s`)
                else if (current === null) changes.push({ kind: 'add', relative: path, absolute: definition, upstream, artifact: artifact.name })
            } else if (current === null || upstream === recorded) changes.push({ kind: 'same', relative: path, absolute: definition, upstream, artifact: artifact.name })
            else changes.push({ kind: current === recorded ? 'replace' : 'reconcile', relative: path, absolute: definition, upstream, artifact: artifact.name })
        }

        for (const [artifact, recorded] of Object.entries(entry.artifacts))
            if (!artifacts.some((candidate) => candidate.name === artifact))
                changes.push({ kind: 'gone', relative: `${ArtifactCompiler.prefix(artifact)}/${Artifact.DEFINITION}`, absolute: null, upstream: recorded, artifact })

        if (problems.length > 0) throw new Error(`Nothing was written: the new ${name} would collide with this project.\n  ${problems.join('\n  ')}\nResolve them, then update again.`)

        const installed = []

        for (const node of dependencies) {
            await this.write(node, ledger, false)
            installed.push(node.feature.name)
        }

        const files: Record<string, string> = {}
        const owned: Record<string, string> = {}
        const updated: string[] = []
        const reconciled: string[] = []
        const conflicts: { path: string; upstream: string; reason: string }[] = []
        const kept: string[] = []

        // What a script can settle goes first and the ledger is written right after, so that the
        // reconciles — an agent's judgement, which can fail or be interrupted — find the project already
        // consistent: a file it could not merge is simply one with local edits, as the ledger says.
        for (const change of changes) {
            const target = join(this.root, change.relative)
            const record = change.artifact === null ? files : owned

            if (change.kind === 'gone') {
                const current = await Ledger.digest(target)

                if (current === null) continue
                if (current !== change.upstream) {
                    kept.push(change.relative)
                    continue
                }

                if (change.artifact === null) await this.take(target)
                else if (ledger.users(change.artifact).length === 1) await this.discard(change.artifact)

                updated.push(`- ${change.relative}`)
                continue
            }

            record[change.artifact ?? change.relative] = change.upstream

            if (change.kind === 'same' || change.kind === 'reconcile') continue

            if (change.artifact === null) {
                await mkdir(dirname(target), { recursive: true })
                await cp(change.absolute!, target)
            } else {
                await rm(dirname(target), { recursive: true, force: true })
                await cp(dirname(change.absolute!), dirname(target), { recursive: true, filter: (path) => !Feature.INTERNAL.includes(path.split('/').pop()!) })
                await new ArtifactCompiler({ cwd: this.root, agent: this.agent }).compile(await Artifact.load(change.artifact, this.root))
            }

            updated.push(change.relative)
        }

        const home = join(this.root, Feature.prefix(name))

        await rm(home, { recursive: true, force: true })
        await fresh.copy(home)

        ledger.record(name, { ...entry, requires: self.deps, version: fresh.version, ref: source.ref, sha: source.sha, linked: source.linked, files, artifacts: owned })
        await ledger.save()

        for (const change of changes) {
            if (change.kind !== 'reconcile') continue

            const original = base === null ? null : join(base, change.artifact === null ? Feature.SCAFFOLDING : Feature.ARTIFACTS, change.artifact === null ? change.relative : `${change.artifact}/${Artifact.DEFINITION}`)
            const outcome = await this.reconcile(name, entry.sha, source.sha, change.relative, change.absolute!, original)

            if (!outcome.done) {
                conflicts.push({ path: change.relative, upstream: change.absolute!, reason: outcome.reason })
                continue
            }

            reconciled.push(change.relative)

            if (change.artifact !== null) await new ArtifactCompiler({ cwd: this.root, agent: this.agent }).compile(await Artifact.load(change.artifact, this.root))
        }

        return { sha: source.sha, current: false, installed, updated, reconciled, conflicts, kept }
    }

    /** Finds the feature a reference names: in the source it was named from, when bare, or through the registry. */
    private async locate(text: string, from: TemplateSource | null, registry: TemplateRegistry, refresh: boolean): Promise<{ feature: Feature; source: TemplateSource }> {
        const reference = TemplateRef.parse(text)

        if (reference.kind === 'url') {
            const source = await TemplateSource.fetch(reference.url!, reference.ref, { refresh })

            return { feature: await Feature.read(source, null), source }
        }

        if (reference.kind === 'bare' && from !== null && (await from.features()).has(reference.name!)) return { feature: await Feature.read(from, reference.name!), source: from }

        const resolved = registry.resolve('feature', reference)
        const source = await TemplateSource.fetch(resolved.url, reference.ref ?? resolved.ref, { refresh })

        return { feature: await Feature.read(source, resolved.name), source }
    }

    /**
     * Closes the graph of what the given features require, dependencies first, skipping what the
     * project already has. A feature that requires itself, however indirectly, is refused with the cycle.
     */
    private async plan(
        roots: { feature: Feature; source: TemplateSource }[],
        ledger: Ledger,
        registry: TemplateRegistry,
        refresh: boolean,
    ): Promise<{ feature: Feature; source: TemplateSource; deps: string[] }[]> {
        const plan: { feature: Feature; source: TemplateSource; deps: string[] }[] = []
        const visiting = new Set<string>()
        const visit = async (node: { feature: Feature; source: TemplateSource }, chain: string[]): Promise<void> => {
            const name = node.feature.name

            if (plan.some((planned) => planned.feature.name === name)) return
            if (visiting.has(name)) throw new Error(`${[...chain, name].join(' -> ')} is a cycle: a feature cannot require itself`)

            visiting.add(name)

            const deps: string[] = []

            for (const text of node.feature.requires) {
                const reference = TemplateRef.parse(text)

                if (reference.kind !== 'url' && (ledger.entry(reference.name!) !== undefined || plan.some((planned) => planned.feature.name === reference.name))) {
                    deps.push(reference.name!)
                    continue
                }

                const dependency = await this.locate(text, node.source, registry, refresh)

                deps.push(dependency.feature.name)

                if (ledger.entry(dependency.feature.name) === undefined) await visit(dependency, [...chain, name])
            }

            visiting.delete(name)
            plan.push({ ...node, deps })
        }

        for (const root of roots) await visit(root, [])

        return plan
    }

    /** Refuses the whole plan if any file or artifact of it would land on something already there, listing every one. */
    private async check(plan: { feature: Feature }[]): Promise<void> {
        const problems: string[] = []
        const claimed = new Map<string, string>()
        const definitions = new Map<string, { owner: string; content: string }>()

        for (const { feature } of plan) {
            for (const file of await feature.overlay()) {
                const owner = claimed.get(file.relative)

                if (owner !== undefined) problems.push(`${file.relative} is written by both ${owner} and ${feature.name}`)
                else if (await Bun.file(join(this.root, file.relative)).exists()) problems.push(`${file.relative} already exists`)

                claimed.set(file.relative, feature.name)
            }

            for (const artifact of await feature.artifacts()) {
                const content = await Bun.file(join(artifact.path, Artifact.DEFINITION)).text()
                const other = definitions.get(artifact.name)
                const existing = Bun.file(Artifact.path(artifact.name, this.root))

                if (other !== undefined && other.content !== content) problems.push(`the artifact ${artifact.name} is defined differently by ${other.owner} and ${feature.name}`)
                else if (other === undefined && (await existing.exists()) && (await existing.text()) !== content)
                    problems.push(`the artifact ${artifact.name} already exists at ${Artifact.ROOT}/${artifact.name} and differs from ${feature.name}'s`)

                definitions.set(artifact.name, { owner: feature.name, content })
            }
        }

        if (problems.length > 0)
            throw new Error(`Nothing was written: ${plan.map((node) => node.feature.name).join(', ')} would collide with this project.\n  ${problems.join('\n  ')}\nResolve them, then add again.`)
    }

    /**
     * Lays one feature down: its overlay, its artifacts compiled into skills, its own document and
     * scripts, then the ledger entry — written before the install steps run, so a failing step leaves
     * a feature that can be removed rather than one the project does not know it has.
     */
    private async write(node: { feature: Feature; source: TemplateSource; deps: string[] }, ledger: Ledger, explicit: boolean): Promise<void> {
        const { feature, source, deps } = node
        const files: Record<string, string> = {}
        const artifacts: Record<string, string> = {}

        this.log(`${feature.name}${feature.version === null ? '' : ` ${feature.version}`}`)

        for (const file of await feature.overlay()) {
            const target = join(this.root, file.relative)

            await mkdir(dirname(target), { recursive: true })
            await cp(file.absolute, target)

            files[file.relative] = (await Ledger.digest(target))!
            this.log(`  + ${file.relative}`)
        }

        for (const artifact of await feature.artifacts()) {
            const dir = join(this.root, ArtifactCompiler.prefix(artifact.name))
            const existed = await Bun.file(join(dir, Artifact.DEFINITION)).exists()

            if (!existed) {
                await cp(artifact.path, dir, { recursive: true, filter: (path) => !Feature.INTERNAL.includes(path.split('/').pop()!) })
                await new ArtifactCompiler({ cwd: this.root, agent: this.agent }).compile(await Artifact.load(artifact.name, this.root))
                this.log(`  + artifact ${artifact.name}`)
            }

            if (!existed || ledger.users(artifact.name).length > 0) artifacts[artifact.name] = (await Ledger.digest(join(dir, Artifact.DEFINITION)))!
        }

        const home = join(this.root, Feature.prefix(feature.name))

        await rm(home, { recursive: true, force: true })
        await feature.copy(home)

        ledger.record(feature.name, { explicit, requires: deps, version: feature.version, url: source.url, ref: source.ref, sha: source.sha, linked: source.linked, files, artifacts })
        await ledger.save()

        await (await Feature.at(home)).run('install', { cwd: this.root, agent: this.agent, log: this.log })
    }

    /** Takes one feature out: its uninstall steps, then every untouched file and artifact it brought, then its entry. */
    private async erase(name: string, ledger: Ledger, kept: string[]): Promise<void> {
        const entry = ledger.entry(name)!
        const home = join(this.root, Feature.prefix(name))

        this.log(name)

        if (await Bun.file(join(home, Feature.MANIFEST)).exists()) await (await Feature.at(home)).run('uninstall', { cwd: this.root, agent: this.agent, log: this.log })

        for (const [path, hash] of Object.entries(entry.files)) {
            const target = join(this.root, path)
            const current = await Ledger.digest(target)

            if (current === null) continue
            if (current !== hash) {
                kept.push(path)
                continue
            }

            await this.take(target)
            this.log(`  - ${path}`)
        }

        ledger.forget(name)

        for (const [artifact, hash] of Object.entries(entry.artifacts)) {
            if (ledger.users(artifact).length > 0) continue

            const current = await Ledger.digest(Artifact.path(artifact, this.root))

            if (current === null) continue
            if (current !== hash) {
                kept.push(`${ArtifactCompiler.prefix(artifact)}/${Artifact.DEFINITION}`)
                continue
            }

            await this.discard(artifact)
            this.log(`  - artifact ${artifact}`)
        }

        await rm(home, { recursive: true, force: true })
        await ledger.save()
    }

    /**
     * Asks an agent to carry upstream's changes into a file that has local edits, keeping both. Where
     * the two changed the same thing and cannot both stand, the local version stays and the agent says
     * so: that is a conflict to report, never a reason to stop the update or to throw an edit away.
     */
    private async reconcile(name: string, from: string | null, to: string | null, path: string, upstream: string, base: string | null): Promise<{ done: boolean; reason: string }> {
        const original = base !== null && (await Bun.file(base).exists()) ? base : null
        const text = [
            `The "${name}" feature was updated from ${TemplateSource.commit(from)} to ${TemplateSource.commit(to)}.`,
            `It wrote ${path} to this project when it was installed, and that file has been edited here since, so the new upstream version cannot simply replace it.`,
            `Reconcile them in place, the way a three-way merge would: bring every upstream change into ${path} and keep every local edit.`,
            'Where upstream and the local edits changed the same lines and both cannot stand, keep the local lines, write no conflict markers,',
            'and report a failed outcome naming exactly those lines; everything else that could be merged must still be merged first.',
            `- The new upstream version: ${upstream} (read it; do not modify it)`,
            original === null ? '- The version originally installed is not available: infer the local edits by comparing the two' : `- The version originally installed: ${original} (read it; do not modify it)`,
            `Edit only ${path}. Say in a few sentences what you took from upstream and what you kept. ${Agent.protocol('every upstream change was merged in')}`,
        ].join('\n')

        this.log(`  ~ ${path}  agent`)

        const answer = await this.agent.act(text, this.root).catch((error: Error) => `OUTCOME: failed — the agent could not run: ${error.message}`)
        const outcome = Agent.outcome(answer)
        const said = answer.replace(Agent.OUTCOME, '').trim()

        if (said !== '') this.log(said.split('\n').map((line) => `    ${line}`).join('\n'))

        return outcome
    }

    /** Removes a file, and every directory that is left empty above it. */
    private async take(target: string): Promise<void> {
        await rm(target, { force: true })

        for (let dir = dirname(target); dir !== this.root && dir.startsWith(this.root); dir = dirname(dir)) {
            const entries = await readdir(dir).catch(() => null)

            if (entries === null || entries.length > 0) break

            await rmdir(dir)
        }
    }

    /** Removes an artifact and every skill it compiled to. */
    private async discard(artifact: string): Promise<void> {
        await rm(join(this.root, ArtifactCompiler.prefix(artifact)), { recursive: true, force: true })

        for (const skill of ArtifactCompiler.skills(artifact)) await rm(join(this.root, skill), { recursive: true, force: true })
    }
}
