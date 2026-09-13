import { cp, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { StringUtils } from './StringUtils.class'
import { TemplateSource } from './TemplateSource.class.ts'

/**
 * One template, ready to be laid down. A template is `template.json` plus a `scaffolding/` directory:
 * the scaffolding is what a generated project gets, verbatim, and everything beside it is machinery
 * that never leaves the template. Nothing is substituted — a generated project is yours to edit.
 */
export class Template {
    /** What gets copied. The only part of a template that reaches the target. */
    static readonly SCAFFOLDING = 'scaffolding'
    /** What a template runs in a generated project once its files are in place: installing dependencies, mostly. */
    static readonly INSTALL = 'install.sh'
    /** Files that hold a template together but mean nothing in a generated project. */
    static readonly INTERNAL = ['.gitkeep', '.DS_Store']
    /** What a fresh template's install script says, for the author to replace with what it really needs. */
    static readonly SCRIPT = StringUtils.dedent(`
        #!/bin/sh
        # Runs in the generated project, once its files are in place. Install what it needs here:
        # bun install, cargo fetch, whatever this template is made of. Delete it if it needs nothing.
        set -e
    `)
    /** Where a generated project records the template it came from. */
    static readonly PIN = '.gstudio/project.json'

    private constructor(
        readonly name: string,
        readonly version: string | null,
        readonly description: string | null,
        /** The template's install script, or null when it has none to run. */
        readonly install: string | null,
        /** Where the template sits inside its fetched source. */
        readonly path: string,
        readonly source: TemplateSource,
    ) {}

    /**
     * Writes an empty template: the manifest that names it and the scaffolding directory that will
     * hold what a generated project gets. Refuses an occupied directory rather than mixing into one.
     */
    static async scaffold(name: string, target: string): Promise<string> {
        if ((await readdir(target).catch(() => null)) !== null) throw new Error(`${target} already exists`)

        await mkdir(join(target, Template.SCAFFOLDING), { recursive: true })
        await Bun.write(join(target, TemplateSource.MANIFEST), `${JSON.stringify({ name, version: '0.1.0', description: '' }, null, 4)}\n`)
        await Bun.write(join(target, Template.SCAFFOLDING, '.gitkeep'), '')
        await Bun.write(join(target, Template.INSTALL), Template.SCRIPT)

        return target
    }

    /** Reads the template of this name out of a fetched source. */
    static async read(source: TemplateSource, name: string | null = null): Promise<Template> {
        const templates = await source.templates()
        const chosen = name ?? (templates.size === 1 ? [...templates.keys()][0]! : null)

        if (chosen === null)
            throw new Error(`${source.url} is a catalog of ${templates.size} templates, so it cannot be used directly. Install it, then init one by name:\n  gstudio install template ${source.url}\n  gstudio init <name>`)

        const path = templates.get(chosen)

        if (path === undefined) throw new Error(`${source.url} does not provide the template ${chosen}. It provides: ${[...templates.keys()].join(', ') || 'nothing'}`)

        const manifest = await Bun.file(join(path, TemplateSource.MANIFEST)).json()
        const install = join(path, Template.INSTALL)

        return new Template(
            manifest.name,
            typeof manifest.version === 'string' ? manifest.version : null,
            typeof manifest.description === 'string' ? manifest.description : null,
            (await Bun.file(install).exists()) ? install : null,
            path,
            source,
        )
    }

    /**
     * Lays the template down in a target directory: its scaffolding, then the pin recording where the
     * files came from, then whatever the template asked to run.
     */
    async init(target: string, { force = false, install = true }: { force?: boolean; install?: boolean } = {}): Promise<{ target: string; installed: boolean }> {
        const scaffolding = join(this.path, Template.SCAFFOLDING)

        if ((await readdir(scaffolding).catch(() => null)) === null) throw new Error(`The template ${this.name} has no ${Template.SCAFFOLDING}/ directory`)

        if (!force && (await Template.occupied(target)))
            throw new Error(`${target} is not empty. Run it in an empty directory, or pass --force to write into this one`)

        await mkdir(target, { recursive: true })
        await cp(scaffolding, target, { recursive: true, filter: (source) => !Template.INTERNAL.includes(basename(source)) })
        await this.pin(target)

        if (!install || this.install === null) return { target, installed: false }

        await this.run(target)

        return { target, installed: true }
    }

    /** Whether a directory already holds something a template would be writing over. */
    private static async occupied(target: string): Promise<boolean> {
        const entries = await readdir(target).catch(() => null)

        return entries !== null && entries.some((entry) => !Template.INTERNAL.includes(entry))
    }

    /**
     * Records the template, its source and the exact commit it came from. The commit is what makes
     * this a pin: it stays meaningful after the branch it was cut from has moved on, and it is
     * self-sufficient, so a project can still be updated after its source is renamed or uninstalled.
     */
    private async pin(target: string): Promise<void> {
        const path = join(target, Template.PIN)
        const existing = await Bun.file(path).json().catch(() => ({}))

        await mkdir(join(target, '.gstudio'), { recursive: true })
        await Bun.write(
            path,
            `${JSON.stringify({ ...existing, template: { name: this.name, version: this.version, url: this.source.url, ref: this.source.ref, sha: this.source.sha, linked: this.source.linked } }, null, 4)}\n`,
        )
    }

    /**
     * Runs the template's install script in the generated project. It is the template's own code and
     * it runs as you: installing a template is running it, as it is with any package manager.
     */
    private async run(target: string): Promise<void> {
        const process = Bun.spawn(['sh', this.install!], { cwd: target, stdout: 'inherit', stderr: 'inherit' })
        const code = await process.exited

        if (code !== 0) throw new Error(`${this.name}'s ${Template.INSTALL} failed (exit ${code})`)
    }
}
