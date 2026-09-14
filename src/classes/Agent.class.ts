import { spawn } from 'node:child_process'

/**
 * The llm, as a process. gstudio is AI first: a step that needs judgement is run by an agent the way a
 * step that does not is run by a script, and this is the one place an agent is invoked. `ask` wants an
 * answer and gives the agent nothing to write with; `act` wants work done in a directory and hands it
 * the tools to do it, without asking, because running a feature's install is running its author's code
 * as you, as it is with any package manager.
 */
export class Agent {
    static readonly DEFAULT_MODEL = 'sonnet'
    static readonly DEFAULT_EFFORT = 'high'
    /** What an acting agent may do unattended: read and write the project, and run what it needs to. */
    static readonly TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep']
    /** How an agent reports whether it managed what it was asked, on the last line of its answer. */
    static readonly OUTCOME = /^OUTCOME:\s*(done|failed)(?:\s*[—–:-]\s*(.*))?\s*$/im

    constructor(
        readonly model: string = Agent.DEFAULT_MODEL,
        readonly effort: string = Agent.DEFAULT_EFFORT,
    ) {}

    /** Asks for an answer. The agent can look around but cannot change anything. */
    ask(text: string, cwd = process.cwd()): Promise<string> {
        return this.run(['-p', text, '--model', this.model, '--effort', this.effort], cwd)
    }

    /** Asks for work. The agent edits and runs whatever the task needs, in the directory it is given. */
    act(text: string, cwd = process.cwd()): Promise<string> {
        return this.run(['-p', text, '--model', this.model, '--effort', this.effort, '--permission-mode', 'acceptEdits', '--allowedTools', ...Agent.TOOLS], cwd)
    }

    /**
     * What the agent asked to report an outcome said: whether it was done, and the reason when it was
     * not. An answer without an outcome is a failure, not a success by omission — a transaction cannot
     * proceed on a step that did not say it finished.
     */
    static outcome(answer: string): { done: boolean; reason: string } {
        const match = answer.match(Agent.OUTCOME)

        if (match === null) return { done: false, reason: 'the agent did not report an outcome' }

        return { done: match[1]!.toLowerCase() === 'done', reason: match[2]?.trim() ?? '' }
    }

    /** The sentence every prompt ends with, so the answer is readable by `outcome`. */
    static protocol(what: string): string {
        return `When you are done, end your answer with a single line: \`OUTCOME: done\` if ${what}, or \`OUTCOME: failed — <why>\` if not.`
    }

    private run(args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
            let stdout = ''
            let stderr = ''

            child.stdout.on('data', (chunk) => (stdout += chunk))
            child.stderr.on('data', (chunk) => (stderr += chunk))
            child.on('error', reject)
            child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `claude exited with code ${code}`))))
        })
    }
}
