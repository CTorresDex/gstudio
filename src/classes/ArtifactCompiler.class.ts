import { rm } from 'node:fs/promises'
import { Agent } from './Agent.class.ts'
import { ArrayUtils } from './ArrayUtils.class.ts'
import { Artifact } from './Artifact.class.ts'
import { StepCompiler } from './StepCompiler.class.ts'

// Compiles an artifact definition into one script per `<deterministic>` step and one skill per action.
//
// The scripts are the StepCompiler's business, incremental by hash. What is an artifact's own is the
// skill: one per action, described once by an llm and cached by the hash of the action, rendered from
// the compiled steps. An artifact can be compiled where it sits — inside a feature, say — and keyed by
// where it will be installed, so a precompiled artifact costs nothing to install.
export class ArtifactCompiler {
    /** Where an artifact's scripts and manifest go: the step compiler's names, which are part of what an artifact promises. */
    static readonly SCRIPTS = StepCompiler.SCRIPTS
    static readonly MANIFEST = StepCompiler.MANIFEST
    static readonly TARGETS = ['.claude', '.codex'] as const
    static readonly LOOPED = ['create', 'update'] as const

    private readonly cwd: string
    private readonly agent: Agent
    private readonly steps: StepCompiler

    constructor(options: { cwd?: string; agent?: Agent } = {}) {
        this.cwd = options.cwd ?? process.cwd()
        this.agent = options.agent ?? new Agent()
        this.steps = new StepCompiler(this.agent)
    }

    /** Where an artifact of this name sits in a project, and where its scripts are keyed. */
    static prefix(name: string): string {
        return `${Artifact.ROOT}/${name}`
    }

    /** Every skill an artifact of this name compiles to, wherever it was compiled. */
    static skills(name: string): string[] {
        return Artifact.ACTIONS.flatMap((action) => ArtifactCompiler.TARGETS.map((target) => `${target}/skills/${action}-${name}`))
    }

    async compile(
        artifact: Artifact,
        {
            dir = `${this.cwd}/${ArtifactCompiler.prefix(artifact.name)}`,
            targets = ArtifactCompiler.TARGETS as readonly string[],
        }: { dir?: string; targets?: readonly string[] } = {},
    ): Promise<{
        skills: { name: string; action: string; built: string[]; reused: string[]; targets: string[] }[]
        removed: string[]
    }> {
        if (artifact.actions.length === 0) throw new Error(`Artifact "${artifact.name}" declares no actions to compile`)

        const prefix = ArtifactCompiler.prefix(artifact.name)
        const previous = (await StepCompiler.manifest(dir)) as {
            steps: Record<string, { hash: string; instruction: string }>
            descriptions?: Record<string, { hash: string; text: string }>
        }
        const compiled = await this.steps.compile(artifact.document, 'artifact', { dir, prefix, previous: previous.steps })
        const rendered = new Map(compiled.sections.map((section) => [section.name, section.steps.map((step) => (step.kind === 'llm' ? ArtifactCompiler.llmStep(step.content) : ArtifactCompiler.deterministicStep(step.instruction)))]))
        const descriptions: Record<string, { hash: string; text: string }> = {}
        const skills = []

        for (const section of compiled.sections) {
            const action = artifact.action(section.name as (typeof Artifact.ACTIONS)[number])!
            const name = `${action.name}-${artifact.name}`
            const hash = new Bun.CryptoHasher('sha256').update(`${artifact.name}\0${artifact.rules}\0${action.source}`).digest('hex')
            const cached = previous.descriptions?.[action.name]
            const text = cached?.hash === hash ? cached.text : await this.describe(artifact, action, name)
            const content = `---\nname: ${name}\ndescription: ${text.includes(':') ? JSON.stringify(text) : text}\n---\n\n${this.render(artifact, action, rendered.get(action.name)!, rendered.get('evaluate') ?? null)}`
            const written = []

            descriptions[action.name] = { hash, text }

            for (const target of targets) {
                await Bun.write(`${this.cwd}/${target}/skills/${name}/SKILL.md`, content)
                written.push(`${target}/skills/${name}/SKILL.md`)
            }

            skills.push({ name, action: action.name, built: section.built, reused: section.reused, targets: written })
        }

        const removed = [...compiled.removed]

        for (const action of Object.keys(previous.descriptions ?? {})) {
            if (action in descriptions) continue

            for (const target of targets) {
                const skill = `${target}/skills/${action}-${artifact.name}`

                await rm(`${this.cwd}/${skill}`, { recursive: true, force: true })
                removed.push(skill)
            }
        }

        await StepCompiler.save(dir, { steps: compiled.steps, descriptions })

        return { skills, removed }
    }

    private async describe(artifact: Artifact, action: Artifact['actions'][number], name: string): Promise<string> {
        const text = [
            `Write the one-line description of an agent skill named "${name}".`,
            `The skill performs the "${action.name}" action on a "${artifact.name}" artifact of a codebase.`,
            'State what it does and what input it receives, in one sentence under 200 characters, plain text,',
            'no quotes, no line breaks, no markdown, nothing else.',
            '',
            '## Artifact rules',
            '',
            artifact.rules,
            '',
            `## The "${action.name}" action`,
            '',
            action.source,
        ].join('\n')
        const description = (await this.agent.ask(text, this.cwd)).replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim()

        if (description === '') throw new Error(`Generated description for skill "${name}" is empty`)

        return description
    }

    private render(artifact: Artifact, action: Artifact['actions'][number], steps: string[], evaluate: string[] | null): string {
        const sections = [
            [
                `# ${action.name} ${artifact.name}`,
                '',
                'Every step below is either **deterministic** (run the script exactly as written, from the project root,',
                'and use its exit code and output) or **llm** (reason and act yourself). Never treat a step as the other kind.',
                'Follow the steps in order.',
            ].join('\n'),
            ['## Rules', '', artifact.rules].join('\n'),
        ]
        const own = [...steps]

        if (action.name === 'update') {
            own.push(
                ArtifactCompiler.llmStep(
                    [
                        `Apply the change request to the content of the ${artifact.name} files as located by the rules.`,
                        'Edit the files directly so they reflect the requested change while still complying with every rule.',
                    ].join('\n'),
                ),
            )
        }

        sections.push(['## Steps', '', ArrayUtils.numbered(own)].join('\n'))

        if ((ArtifactCompiler.LOOPED as readonly string[]).includes(action.name)) {
            sections.push(
                evaluate === null
                    ? ['## Evaluation loop', '', 'This artifact defines no evaluate action, so nothing verifies the result. Report that to the user.'].join('\n')
                    : [
                          '## Evaluation loop',
                          '',
                          `After the steps above, the ${artifact.name} must comply with the rules. Verify it with this loop:`,
                          '',
                          ArrayUtils.numbered([
                              ...evaluate,
                              ArtifactCompiler.llmStep(
                                  [
                                      'If every deterministic step of this loop exited 0, the loop is done.',
                                      'Otherwise fix every discrepancy they reported, editing the files as located by the rules,',
                                      'and restart the loop from its first step. Repeat until every deterministic step exits 0.',
                                  ].join('\n'),
                              ),
                          ]),
                      ].join('\n'),
            )
        }

        return `${sections.join('\n\n')}\n`
    }

    private static deterministicStep(instruction: string): string {
        return `**deterministic** — ${instruction.trim()}`
    }

    private static llmStep(content: string): string {
        return `**llm** — ${content.trim()}`
    }
}
