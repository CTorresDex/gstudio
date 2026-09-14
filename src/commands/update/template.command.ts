import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio update template <alias> [--ref <ref>]')

    const registry = await TemplateRegistry.load()
    const updated = await registry.update(args[0], { ref: typeof context.flags.ref === 'string' ? context.flags.ref : null })

    console.log(updated.sha === null ? `Re-read ${args[0]} (linked)` : `Updated ${args[0]} to ${TemplateSource.commit(updated.sha)}`)

    for (const kind of TemplateRegistry.KINDS) {
        if (updated[kind].added.length > 0) console.log(`Added ${kind}s: ${updated[kind].added.join(', ')}`)
        if (updated[kind].removed.length > 0) console.log(`Removed ${kind}s: ${updated[kind].removed.join(', ')}`)

        for (const name of updated[kind].conflicts)
            console.log(`\n${args[0]} now also provides the ${kind} ${name}, which ${registry.providers(kind, name).filter((alias) => alias !== args[0]).join(' and ')} already provides.\nUse a full name, or choose which one ${name} means: gstudio use ${kind} ${name} ${args[0]}/${name}`)

        for (const name of updated[kind].dangling) console.log(`\nThe ${kind} ${name} no longer exists in ${args[0]}, so the name ${name} no longer points anywhere.`)
    }
}
