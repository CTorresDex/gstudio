import { Agent } from '../../classes/Agent.class.ts'
import { FeatureInstaller } from '../../classes/FeatureInstaller.class.ts'
import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Brings a feature to what its source now says',
    long: `Usage: gstudio update feature <name> [--model <model>] [--effort <effort>]

Replaces what is untouched, reconciles what you edited, leaves what you deleted
deleted, and reports every file upstream and you both changed.

Arguments:
  <name>       the feature, as this project records it

Flags:
  --model      the model the install steps run on
  --effort     the reasoning effort they run at`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio update feature <name> [--model <model>] [--effort <effort>]')

    const updated = await Progress.of(`Updating the feature ${args[0]}`).run((progress) => new FeatureInstaller(
        process.cwd(),
        new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined),
        (line) => progress.log(line),
    ).update(args[0]!))

    if (updated.current) return console.log(`${args[0]} is already at ${TemplateSource.commit(updated.sha)}`)

    console.log(`\nUpdated ${args[0]} to ${TemplateSource.commit(updated.sha)}`)

    if (updated.installed.length > 0) console.log(`Installed, newly required: ${updated.installed.join(', ')}`)
    if (updated.updated.length > 0) console.log(`Replaced, untouched since they were written:\n  ${updated.updated.join('\n  ')}`)
    if (updated.reconciled.length > 0) console.log(`Reconciled with your edits:\n  ${updated.reconciled.join('\n  ')}`)
    if (updated.kept.length > 0) console.log(`Kept as you left them, though upstream removed them:\n  ${updated.kept.join('\n  ')}`)

    if (updated.conflicts.length === 0) return

    console.log(`Left as you edited them, because upstream changed the same lines:\n${updated.conflicts.map((conflict) => `  ${conflict.path}\n    ${conflict.reason}\n    upstream's version: ${conflict.upstream}`).join('\n')}`)

    throw new Error(`${updated.conflicts.length} file${updated.conflicts.length === 1 ? '' : 's'} need${updated.conflicts.length === 1 ? 's' : ''} your hand`)
}
