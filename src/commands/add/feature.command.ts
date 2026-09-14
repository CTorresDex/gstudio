import { Agent } from '../../classes/Agent.class.ts'
import { FeatureInstaller } from '../../classes/FeatureInstaller.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio add feature <name | alias/name | git-url> [--refresh] [--model <model>] [--effort <effort>]')

    const added = await new FeatureInstaller(
        process.cwd(),
        new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined),
        console.log,
    ).add(args[0], { refresh: context.flags.refresh === true })

    if (added.promoted !== null) return console.log(`${added.promoted} was installed as a dependency; it is now yours, and stays when nothing else requires it`)
    if (added.installed.length === 0) return console.log(`${args[0]} is already installed`)

    console.log(`\nAdded ${added.installed.join(', ')}`)
}
