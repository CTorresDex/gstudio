import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio update template <alias> [--ref <ref>]')

    const registry = await TemplateRegistry.load()
    const updated = await registry.update(args[0], { ref: typeof context.flags.ref === 'string' ? context.flags.ref : null })

    console.log(updated.sha === null ? `Re-read ${args[0]} (linked)` : `Updated ${args[0]} to ${TemplateSource.commit(updated.sha)}`)

    if (updated.added.length > 0) console.log(`Added: ${updated.added.join(', ')}`)
    if (updated.removed.length > 0) console.log(`Removed: ${updated.removed.join(', ')}`)

    for (const name of updated.conflicts)
        console.log(`\n${args[0]} now also provides ${name}, which ${registry.providers(name).filter((alias) => alias !== args[0]).join(' and ')} already provides.\nUse a full name, or choose which one ${name} means: gstudio use template ${name} ${args[0]}/${name}`)

    for (const name of updated.dangling) console.log(`\n${name} no longer exists in ${args[0]}, so the name ${name} no longer points anywhere.`)
}
