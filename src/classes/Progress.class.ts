/**
 * The waiting a command does, said out loud. Anything asynchronous a command awaits is wrapped in one of
 * these, so the terminal always names what is being waited on — compiling, fetching, installing — instead
 * of going quiet. It animates on stderr and erases itself when the work settles, so stdout carries the
 * outcome of the command alone and stays as readable to a script as it is to a person. Work that has
 * something to report as it goes is handed the indicator itself: `say` changes what it is waiting on,
 * `log` prints a finished line above it without the animation stepping on it.
 */
export class Progress {
    /** The spinner, and how fast it turns. */
    static readonly FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    static readonly INTERVAL = 80

    private timer: ReturnType<typeof setInterval> | null = null
    private frame = 0
    private drawn = 0

    private constructor(private label: string) {}

    /** A progress indicator that says the given thing while it spins. */
    static of(label: string): Progress {
        return new Progress(label)
    }

    /** Runs the work, spinning until it settles, and gives back whatever it gave back. */
    async run<Result>(work: (progress: Progress) => Promise<Result> | Result): Promise<Result> {
        this.start()

        try {
            return await work(this)
        } finally {
            this.stop()
        }
    }

    /** Says something else from now on, for work that moves on to its next part. */
    say(label: string): void {
        this.erase()
        this.label = label

        if (this.timer === null) return process.stderr.isTTY ? undefined : void process.stderr.write(`${label}...\n`)

        this.draw()
    }

    /** Prints a finished line as the outcome it is, above the animation rather than under it. */
    log(line: string): void {
        this.erase()

        console.log(line)

        if (this.timer !== null) this.draw()
    }

    /** Starts the animation, or announces the work once where nothing can be animated. */
    private start(): void {
        if (!process.stderr.isTTY) return void process.stderr.write(`${this.label}...\n`)

        this.draw()

        this.timer = setInterval(() => this.draw(), Progress.INTERVAL)
    }

    /** Stops it and leaves the line as it found it. */
    private stop(): void {
        if (this.timer !== null) clearInterval(this.timer)

        this.timer = null

        this.erase()
    }

    /** One frame, over whatever the last one left. */
    private draw(): void {
        const line = `${Progress.FRAMES[this.frame++ % Progress.FRAMES.length]} ${this.label}`

        process.stderr.write(`\r${line}`)

        this.drawn = line.length
    }

    /** Takes the drawn frame off the line, so what is printed next starts clean. */
    private erase(): void {
        if (this.drawn === 0) return

        process.stderr.write(`\r${' '.repeat(this.drawn)}\r`)

        this.drawn = 0
    }
}
