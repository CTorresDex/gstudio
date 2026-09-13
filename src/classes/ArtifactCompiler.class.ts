import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { Artifact } from './Artifact.class.ts'
import { ArrayUtils } from './ArrayUtils.class.ts'

// Compiles an artifact definition into one script per `<deterministic>` step and one skill per action.
//
// Building a script costs an llm call, so the build is incremental: every step is keyed by the hash of
// everything the compiler is given to build it. A step whose hash is unchanged keeps its script and its
// run instruction; a step that only moved has its script renamed; anything the definition no longer
// declares — a step, an action, a whole skill — is deleted.
export class ArtifactCompiler {
    static readonly SCRIPTS = 'scripts'
    static readonly MANIFEST = 'compiled.json'
    static readonly TARGETS = ['.claude', '.codex'] as const
    static readonly LOOPED = ['create', 'update'] as const
    static readonly PLACEHOLDER = '{{script}}'
    static readonly DEFAULT_MODEL = 'sonnet'
    static readonly DEFAULT_EFFORT = 'high'

    private static readonly MARKER = '---INSTRUCTION---'
    private static readonly EXTENSIONS: Record<string, string> = {
        sh: 'sh', bash: 'sh', zsh: 'sh', ts: 'ts', typescript: 'ts', js: 'js', javascript: 'js', py: 'py', python: 'py',
    }

    private readonly cwd: string
    private readonly model: string
    private readonly effort: string
    private readonly prompt: (text: string) => Promise<string>

    constructor(options: { cwd?: string; model?: string; effort?: string; prompt?: (text: string) => Promise<string> } = {}) {
        this.cwd = options.cwd ?? process.cwd()
        this.model = options.model ?? ArtifactCompiler.DEFAULT_MODEL
        this.effort = options.effort ?? ArtifactCompiler.DEFAULT_EFFORT
        this.prompt = options.prompt ?? ((text) => this.claude(text))
    }

    async compile(artifact: Artifact): Promise<{
        skills: { name: string; action: string; built: string[]; reused: string[]; targets: string[] }[]
        removed: string[]
    }> {
        if (artifact.actions.length === 0) throw new Error(`Artifact "${artifact.name}" declares no actions to compile`)

        const dir = `${this.cwd}/${Artifact.ROOT}/${artifact.name}`
        const manifest = Bun.file(`${dir}/${ArtifactCompiler.MANIFEST}`)
        const previous: {
            steps: Record<string, { hash: string; instruction: string }>
            descriptions: Record<string, { hash: string; text: string }>
        } = (await manifest.exists()) ? await manifest.json() : { steps: {}, descriptions: {} }

        const orphans = new Map<string, { path: string; instruction: string }>()
        const moved = new Set<string>()

        for (const [path, entry] of Object.entries(previous.steps)) orphans.set(entry.hash, { path, instruction: entry.instruction })

        const steps: typeof previous.steps = {}
        const descriptions: typeof previous.descriptions = {}
        const skills = []
        const rendered = new Map<string, string[]>()

        for (const action of artifact.actions) {
            const body = []
            const built = []
            const reused = []

            for (const [index, step] of action.steps.entries()) {
                if (step.kind === 'llm') {
                    body.push(ArtifactCompiler.llmStep(step.content))
                    continue
                }

                const extension = ArtifactCompiler.EXTENSIONS[(step.lang ?? 'sh').toLowerCase()] ?? 'sh'
                const path = `${Artifact.ROOT}/${artifact.name}/${ArtifactCompiler.SCRIPTS}/${action.name}/step-${index + 1}.${extension}`
                const kept = await this.reuse(step.hash, path, previous.steps[path], orphans, moved)

                if (kept === null) {
                    const generated = await this.generate(artifact, action, step, path)

                    await mkdir(dirname(`${this.cwd}/${path}`), { recursive: true })
                    await Bun.write(`${this.cwd}/${path}`, generated.content)
                    await chmod(`${this.cwd}/${path}`, 0o755)

                    steps[path] = { hash: step.hash, instruction: generated.instruction }
                    built.push(path)
                } else {
                    steps[path] = { hash: step.hash, instruction: kept }
                    reused.push(path)
                }

                body.push(ArtifactCompiler.deterministicStep(steps[path]!.instruction.replaceAll(ArtifactCompiler.PLACEHOLDER, path)))
            }

            rendered.set(action.name, body)
            skills.push({ name: `${action.name}-${artifact.name}`, action: action.name, built, reused, targets: [] as string[] })
        }

        for (const skill of skills) {
            const action = artifact.action(skill.action as (typeof Artifact.ACTIONS)[number])!
            const hash = new Bun.CryptoHasher('sha256').update(`${artifact.name}\0${artifact.rules}\0${action.source}`).digest('hex')
            const cached = previous.descriptions[action.name]
            const text = cached?.hash === hash ? cached.text : await this.describe(artifact, action, skill.name)
            const content = `---\nname: ${skill.name}\ndescription: ${text.includes(':') ? JSON.stringify(text) : text}\n---\n\n${this.render(artifact, action, rendered.get(action.name)!, rendered.get('evaluate') ?? null)}`

            descriptions[action.name] = { hash, text }

            for (const target of ArtifactCompiler.TARGETS) {
                await Bun.write(`${this.cwd}/${target}/skills/${skill.name}/SKILL.md`, content)
                skill.targets.push(`${target}/skills/${skill.name}/SKILL.md`)
            }
        }

        const removed = await this.prune(artifact, previous, steps, descriptions, moved)

        await Bun.write(`${dir}/${ArtifactCompiler.MANIFEST}`, `${JSON.stringify({ steps, descriptions }, null, 4)}\n`)

        return { skills, removed }
    }

    /** Returns the run instruction of a script that survives this compile, or null when it must be built. */
    private async reuse(
        hash: string,
        path: string,
        previous: { hash: string; instruction: string } | undefined,
        orphans: Map<string, { path: string; instruction: string }>,
        moved: Set<string>,
    ): Promise<string | null> {
        if (previous?.hash === hash && (await Bun.file(`${this.cwd}/${path}`).exists())) {
            orphans.delete(hash)

            return previous.instruction
        }

        const relocated = orphans.get(hash)

        if (relocated === undefined || relocated.path === path || !(await Bun.file(`${this.cwd}/${relocated.path}`).exists())) return null

        await mkdir(dirname(`${this.cwd}/${path}`), { recursive: true })
        await rename(`${this.cwd}/${relocated.path}`, `${this.cwd}/${path}`)
        orphans.delete(hash)
        moved.add(relocated.path)

        return relocated.instruction
    }

    /** Deletes every script and skill the definition no longer declares. */
    private async prune(
        artifact: Artifact,
        previous: { steps: Record<string, unknown>; descriptions: Record<string, unknown> },
        steps: Record<string, unknown>,
        descriptions: Record<string, unknown>,
        moved: Set<string>,
    ): Promise<string[]> {
        const removed = []

        for (const path of Object.keys(previous.steps)) {
            if (path in steps || moved.has(path)) continue

            await rm(`${this.cwd}/${path}`, { force: true })
            removed.push(path)
        }

        for (const action of Object.keys(previous.descriptions)) {
            if (action in descriptions) continue

            const scripts = `${Artifact.ROOT}/${artifact.name}/${ArtifactCompiler.SCRIPTS}/${action}`

            await rm(`${this.cwd}/${scripts}`, { recursive: true, force: true })
            removed.push(scripts)

            for (const target of ArtifactCompiler.TARGETS) {
                const skill = `${target}/skills/${action}-${artifact.name}`

                await rm(`${this.cwd}/${skill}`, { recursive: true, force: true })
                removed.push(skill)
            }
        }

        return removed
    }

    private async generate(
        artifact: Artifact,
        action: Artifact['actions'][number],
        step: Artifact['actions'][number]['steps'][number],
        path: string,
    ): Promise<{ content: string; instruction: string }> {
        const lang = step.lang ?? 'sh'
        const text = [
            `You are compiling the "${action.name}" action of the "${artifact.name}" artifact into a script.`,
            `Write a single self-contained ${lang} script that implements ONLY the deterministic step below.`,
            'The script is executed from the project root, so every path in it is relative to the project root.',
            `It will be stored at ${path}. It receives its input as command line arguments.`,
            'Whenever the step says "as defined at the rules", resolve it with the artifact rules below.',
            'Do not implement anything that the step leaves to the llm. Do not add features the step does not ask for.',
            'Exit with a non-zero code on any failure the step describes, printing a clear message.',
            '',
            'Then state how the script must be invoked.',
            `Output the raw script contents first, then a line containing exactly ${ArtifactCompiler.MARKER},`,
            `then one sentence telling the reader to run the script, referring to its path as ${ArtifactCompiler.PLACEHOLDER}.`,
            `If the script takes arguments, the instruction must spell their syntax out explicitly (e.g. \`${ArtifactCompiler.PLACEHOLDER} <name> [--flag]\`);` +
                ` if it takes none, use \`${ArtifactCompiler.PLACEHOLDER}\` on its own.`,
            'No markdown fences, no explanation, no preamble: the very first line of your output is the first line of the script.',
            '',
            '## Artifact rules',
            '',
            artifact.rules,
            '',
            `## The whole "${action.name}" action (for context only, do NOT implement the other steps)`,
            '',
            action.source,
            '',
            '## The deterministic step to implement',
            '',
            step.content,
        ].join('\n')

        const raw = await this.prompt(text)
        const marker = raw.indexOf(ArtifactCompiler.MARKER)

        if (marker === -1) throw new Error(`Generated script for ${path} is missing its run instruction`)

        const shebang = raw.slice(0, marker).trim().indexOf('#!')
        const script = raw
            .slice(0, marker)
            .trim()
            .slice(shebang > 0 ? shebang : 0)
            .replace(/^```[a-z]*\n/i, '')
            .replace(/\n```$/, '')
            .trimEnd()
        const instruction = raw.slice(marker + ArtifactCompiler.MARKER.length).trim()

        if (script === '') throw new Error(`Generated script for ${path} is empty`)
        if (!instruction.includes(ArtifactCompiler.PLACEHOLDER)) {
            throw new Error(`Generated run instruction for ${path} must invoke the script as ${ArtifactCompiler.PLACEHOLDER}`)
        }

        return { content: `${script}\n`, instruction }
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
        const description = (await this.prompt(text)).replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim()

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

    private claude(text: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn('claude', ['-p', text, '--model', this.model, '--effort', this.effort], { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
            let stdout = ''
            let stderr = ''

            child.stdout.on('data', (chunk) => (stdout += chunk))
            child.stderr.on('data', (chunk) => (stderr += chunk))
            child.on('error', reject)
            child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `claude exited with code ${code}`))))
        })
    }
}
