import { StringUtils } from './StringUtils.class'

/**
 * A document of rules and steps: a preamble stating the law, then one `## verb` section per move, each
 * an ordered sequence of what a script can settle and what an agent has to judge. It is the shape an
 * artifact is written in and the shape a feature is written in — only the vocabulary of verbs differs,
 * so the vocabulary is an argument and the grammar lives here once.
 */
export class StepDocument {
    /** The language a deterministic step is written in when it does not say. */
    static readonly DEFAULT_LANG = 'sh'

    private static readonly SECTION = /^##[ \t]+(\S+)[ \t]*$/gm
    private static readonly STEP = /<(deterministic|llm)(?:\s+lang="([^"]*)")?\s*>([\s\S]*?)<\/\1>/g

    private constructor(
        readonly name: string,
        readonly rules: string,
        readonly sections: {
            name: string
            source: string
            steps: { kind: 'deterministic' | 'llm'; lang?: string; content: string; hash: string }[]
        }[],
    ) {}

    /**
     * Splits a document into its rules — everything before the first heading — and its sections.
     *
     * `label` is what the document is called when something is wrong with it, and `verbs` is the closed
     * vocabulary it may declare: a heading outside that vocabulary is an error rather than a section
     * quietly ignored, because a misspelled verb would otherwise compile to nothing at all.
     */
    static parse(label: string, name: string, source: string, verbs: readonly string[]): StepDocument {
        const headings = [...source.matchAll(new RegExp(StepDocument.SECTION.source, 'gm'))]
        const rules = source.slice(0, headings[0]?.index ?? source.length).trim()

        if (rules === '') throw new Error(`${label} "${name}" declares no rules`)

        const sections: StepDocument['sections'] = []

        for (const [index, heading] of headings.entries()) {
            const verb = heading[1]!
            const body = source.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? source.length)

            if (!verbs.includes(verb)) throw new Error(`${label} "${name}": unknown action "${verb}"`)
            if (sections.some((other) => other.name === verb)) throw new Error(`${label} "${name}": duplicated action "${verb}"`)
            if (body.trim() === '') continue

            try {
                sections.push({ name: verb, source: body.trim(), steps: StepDocument.steps(body, `${name}\0${rules}\0${verb}`) })
            } catch (error) {
                throw new Error(`${label} "${name}", action "${verb}": ${(error as Error).message}`)
            }
        }

        return new StepDocument(name, rules, sections)
    }

    section(name: string): StepDocument['sections'][number] | undefined {
        return this.sections.find((section) => section.name === name)
    }

    /**
     * Splits a section into its ordered steps: what can be decided, and what must be judged.
     *
     * Every step carries the hash of everything a compiler is given to build it — the document's name,
     * its rules, the verb, the language and the step itself — so a compiler can tell what changed.
     */
    private static steps(source: string, seed: string): StepDocument['sections'][number]['steps'] {
        const re = new RegExp(StepDocument.STEP.source, 'g')
        const steps: StepDocument['sections'][number]['steps'] = []
        let last = 0
        let match: RegExpExecArray | null

        while ((match = re.exec(source))) {
            if (source.slice(last, match.index).trim() !== '') throw new Error('content outside <deterministic> and <llm> tags is not allowed')

            const [, kind, lang, content] = match
            const step =
                kind === 'deterministic'
                    ? { kind: 'deterministic' as const, lang: lang || StepDocument.DEFAULT_LANG, content: StringUtils.dedent(content ?? '') }
                    : { kind: 'llm' as const, content: StringUtils.dedent(content ?? '') }

            steps.push({
                ...step,
                hash: new Bun.CryptoHasher('sha256')
                    .update(`${seed}\0${step.kind}\0${'lang' in step ? step.lang : ''}\0${step.content}`)
                    .digest('hex'),
            })

            last = re.lastIndex
        }

        if (source.slice(last).trim() !== '') throw new Error('content outside <deterministic> and <llm> tags is not allowed')
        if (steps.length === 0) throw new Error('no <deterministic> or <llm> steps found')

        return steps
    }
}
