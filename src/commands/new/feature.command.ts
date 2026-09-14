import { join } from 'node:path'
import { Feature } from '../../classes/Feature.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Scaffolds a feature, ready to be written and compiled',
    long: `Usage: gstudio new feature <name> [--at <directory>]

Writes the manifest, the definition, and the directories a feature travels with:
scaffolding/ for the files it lays over a project, artifacts/ for what it brings.

Arguments:
  <name>       the name the feature is addressed by

Flags:
  --at         where to create it, instead of the current directory`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio new feature <name> [--at <directory>]')

    const target = await Progress.of(`Creating the feature ${args[0]}`).run(() => Feature.scaffold(args[0]!, join(typeof context.flags.at === 'string' ? context.flags.at : process.cwd(), args[0]!)))

    console.log(`Created ${target}`)
    console.log(`Say what the feature requires, how it installs and how it uninstalls in ${target}/${Feature.DEFINITION}`)
    console.log(`Files it lays over a project go in ${target}/${Feature.SCAFFOLDING}; artifacts it brings go in ${target}/${Feature.ARTIFACTS}/<name>/`)
    console.log(`Then compile it where it is written, so installing it costs nothing: gstudio compile feature ${args[0]}`)
}
