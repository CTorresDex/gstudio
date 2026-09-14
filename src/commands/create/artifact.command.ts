import { spawn } from 'node:child_process'
import { Artifact } from '../../classes/Artifact.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Scaffolds an artifact definition and opens it',
    long: `Usage: gstudio create artifact <name>

Writes the definition from the template and opens it in VS Code. Say what the
artifact governs there, then compile it: gstudio compile artifact <name>

Arguments:
  <name>       a single lowercase word naming the kind of file the artifact governs`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio create artifact <name>')

    const path = await Progress.of(`Creating the artifact ${args[0]}`).run(() => Artifact.scaffold(args[0]!))

    console.log(`Created ${path}`)

    spawn('code', [path], { stdio: 'ignore', detached: true }).on('error', () => console.error(`Could not open ${path} with VS Code`)).unref()
}
