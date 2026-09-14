import { Agent } from '../../classes/Agent.class.ts'
import { FeatureInstaller } from '../../classes/FeatureInstaller.class.ts'

export const help = {
    short: 'Takes a feature out, and whatever only it needed',
    long: `Usage: gstudio remove feature <name> [--model <model>] [--effort <effort>]

Gives back exactly what is untouched, keeping every file edited since it was
written. A feature installed because another required it goes when the last of
them goes.

Arguments:
  <name>       the feature, as this project records it

Flags:
  --model      the model the uninstall steps run on
  --effort     the reasoning effort they run at`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio remove feature <name> [--model <model>] [--effort <effort>]')

    const removed = await new FeatureInstaller(
        process.cwd(),
        new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined),
        console.log,
    ).remove(args[0])

    console.log(`\nRemoved ${removed.removed.join(', ')}`)

    if (removed.kept.length > 0) console.log(`Kept, because they were edited since they were written:\n  ${removed.kept.join('\n  ')}`)
}
