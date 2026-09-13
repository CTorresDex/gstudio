import { resolve } from 'node:path'

/**
 * A reference to a template, as typed. Three spellings reach the same place: a git URL naming a
 * repository, `alias/name` naming one template inside an installed source, and a bare `name`
 * leaning on the registry to say which source it meant.
 */
export class TemplateRef {
    /** Where a scheme-less shorthand like `acme/templates` is assumed to live. */
    static readonly DEFAULT_HOST = 'github.com'

    private constructor(
        readonly kind: 'url' | 'qualified' | 'bare',
        readonly url: string | null,
        readonly ref: string | null,
        readonly alias: string | null,
        readonly name: string | null,
    ) {}

    /** Reads a reference the way the user wrote it. */
    static parse(text: string): TemplateRef {
        const trimmed = text.trim()

        if (trimmed === '') throw new Error('A template reference cannot be empty')

        const [body, ref = null] = TemplateRef.split(trimmed)

        if (TemplateRef.isURL(body)) return new TemplateRef('url', TemplateRef.normalize(body), ref, null, null)

        const segments = body.split('/')

        if (segments.length === 1) return new TemplateRef('bare', null, ref, null, segments[0]!)

        if (segments.length === 2) return new TemplateRef('qualified', null, ref, segments[0]!, segments[1]!)

        throw new Error(`Not a template reference: ${text}`)
    }

    /** Splits a trailing `#ref` off a reference, leaving the part that names a place. */
    private static split(text: string): [string, string | null] {
        const hash = text.lastIndexOf('#')

        if (hash === -1) return [text, null]

        return [text.slice(0, hash), text.slice(hash + 1) || null]
    }

    /** Whether a reference names a repository rather than something the registry has to resolve. */
    private static isURL(text: string): boolean {
        return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[^/@]+@[^:]+:/.test(text) || text.startsWith('github:') || TemplateRef.isLocal(text)
    }

    /**
     * Whether a reference names a directory to use where it sits rather than a repository to fetch.
     * A plain path is a folder you are working in; `file://` is a URL and stays git's business, so a
     * bare repository on this machine is still cloned like any other remote.
     */
    static isLocal(text: string): boolean {
        return text.startsWith('/') || text.startsWith('./') || text.startsWith('../') || text === '.'
    }

    /**
     * Reduces a git URL to the repository it names, so the same repository typed over ssh and over
     * https is one source and not two. Returns `host/owner/repo`, lowercased, without `.git`.
     */
    static normalize(url: string): string {
        if (TemplateRef.isLocal(url)) return resolve(url).replace(/\/+$/, '')
        if (url.startsWith('file://')) return `file://${resolve(url.slice('file://'.length)).replace(/\.git$/, '').replace(/\/+$/, '')}`

        const scp = url.match(/^[^/@]+@([^:]+):(.+)$/)
        const shorthand = url.startsWith('github:') ? `${TemplateRef.DEFAULT_HOST}/${url.slice('github:'.length)}` : null
        const path = scp ? `${scp[1]}/${scp[2]}` : shorthand ?? url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^/@]+@/, '')

        return path.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
    }

    /** The URL to hand git, rebuilt from a normalized repository when the reference was a shorthand. */
    static clonable(url: string): string {
        if (TemplateRef.isLocal(url)) return TemplateRef.normalize(url)
        if (url.startsWith('file://')) return url
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || /^[^/@]+@[^:]+:/.test(url)) return url

        return `https://${url}.git`
    }

    /** The alias a source takes when the user does not name one: the repository, without its owner. */
    static defaultAlias(url: string): string {
        const segments = TemplateRef.normalize(url).split('/')

        return segments[segments.length - 1]!
    }

    toString(): string {
        const body = this.kind === 'url' ? this.url! : this.kind === 'qualified' ? `${this.alias}/${this.name}` : this.name!

        return this.ref === null ? body : `${body}#${this.ref}`
    }
}
