import { spawn } from 'node:child_process'
import { Artifact } from '../../classes/Artifact.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio create artifact <name>')

    const path = await Artifact.scaffold(args[0])

    console.log(`Created ${path}`)

    spawn('code', [path], { stdio: 'ignore', detached: true }).on('error', () => console.error(`Could not open ${path} with VS Code`)).unref()
}
