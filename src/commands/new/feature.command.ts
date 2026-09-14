import { join } from 'node:path'
import { Feature } from '../../classes/Feature.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio new feature <name> [--at <directory>]')

    const target = await Feature.scaffold(args[0], join(typeof context.flags.at === 'string' ? context.flags.at : process.cwd(), args[0]))

    console.log(`Created ${target}`)
    console.log(`Say what the feature requires, how it installs and how it uninstalls in ${target}/${Feature.DEFINITION}`)
    console.log(`Files it lays over a project go in ${target}/${Feature.SCAFFOLDING}; artifacts it brings go in ${target}/${Feature.ARTIFACTS}/<name>/`)
    console.log(`Then compile it where it is written, so installing it costs nothing: gstudio compile feature ${args[0]}`)
}
